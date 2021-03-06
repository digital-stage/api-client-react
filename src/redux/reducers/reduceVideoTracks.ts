import omit from 'lodash/omit'
import without from 'lodash/without'
import { ServerDeviceEvents, ServerDevicePayloads, VideoTrack } from '@digitalstage/api-types'
import upsert from '../utils/upsert'
import VideoTracks from '../collections/VideoTracks'
import AdditionalReducerTypes from '../actions/AdditionalReducerTypes'

const addVideoTrack = (state: VideoTracks, videoTrack: VideoTrack): VideoTracks => ({
    ...state,
    byId: {
        ...state.byId,
        [videoTrack._id]: videoTrack,
    },
    byStageMember: {
        ...state.byStageMember,
        [videoTrack.stageMemberId]: upsert<string>(
            state.byStageMember[videoTrack.stageMemberId],
            videoTrack._id
        ),
    },
    byStageDevice: {
        ...state.byStageDevice,
        [videoTrack.stageDeviceId]: upsert<string>(
            state.byStageDevice[videoTrack.stageDeviceId],
            videoTrack._id
        ),
    },
    byUser: {
        ...state.byUser,
        [videoTrack.userId]: upsert<string>(state.byUser[videoTrack.userId], videoTrack._id),
    },
    byStage: {
        ...state.byStage,
        [videoTrack.stageId]: upsert<string>(state.byStage[videoTrack.stageId], videoTrack._id),
    },
    allIds: upsert<string>(state.allIds, videoTrack._id),
})

function reduceVideoTracks(
    state: VideoTracks = {
        byId: {},
        byStageMember: {},
        byStageDevice: {},
        byStage: {},
        byUser: {},
        allIds: [],
    },
    action: {
        type: string
        payload: any
    }
): VideoTracks {
    switch (action.type) {
        case ServerDeviceEvents.StageLeft:
        case AdditionalReducerTypes.RESET: {
            return {
                byId: {},
                byStageMember: {},
                byStageDevice: {},
                byStage: {},
                byUser: {},
                allIds: [],
            }
        }
        case ServerDeviceEvents.StageJoined: {
            const { videoTracks } = action.payload as ServerDevicePayloads.StageJoined
            let updatedState = { ...state }
            if (videoTracks)
                videoTracks.forEach((videoTrack: VideoTrack) => {
                    updatedState = addVideoTrack(updatedState, videoTrack)
                })
            return updatedState
        }
        case ServerDeviceEvents.VideoTrackAdded: {
            const videoTrack = action.payload as ServerDevicePayloads.VideoTrackAdded
            return addVideoTrack(state, videoTrack)
        }
        case ServerDeviceEvents.VideoTrackChanged: {
            const update = action.payload as ServerDevicePayloads.VideoTrackChanged
            return {
                ...state,
                byId: {
                    ...state.byId,
                    [update._id]: {
                        ...state.byId[update._id],
                        ...update,
                    },
                },
            }
        }
        case ServerDeviceEvents.VideoTrackRemoved: {
            const id = action.payload as ServerDevicePayloads.VideoTrackRemoved
            if (!state.byId[id]) {
                return state
            }
            const { stageId, stageMemberId, userId, stageDeviceId } = state.byId[id]
            return {
                ...state,
                byId: omit(state.byId, id),
                byStageMember: {
                    ...state.byStageMember,
                    [stageMemberId]: without(state.byStageMember[stageMemberId], id),
                },
                byStageDevice: {
                    ...state.byStageDevice,
                    [stageDeviceId]: without(state.byStageDevice[stageDeviceId], id),
                },
                byStage: {
                    ...state.byStage,
                    [stageId]: without(state.byStage[stageId], id),
                },
                byUser: {
                    ...state.byUser,
                    [userId]: without(state.byUser[userId], id),
                },
                allIds: without<string>(state.allIds, id),
            }
        }
        default:
            return state
    }
}

export default reduceVideoTracks
