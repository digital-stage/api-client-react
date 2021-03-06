import useDigitalStage, { DigitalStageProvider } from './hooks/useDigitalStage'
import registerSocketHandler from './redux/registerSocketHandler'
import store from './redux/store'
import getInitialDevice from './utils/getInitialDevice'
import { ReducerAction } from './redux/actions'
import { AuthError, AuthUser, ErrorCodes, useAuth } from './hooks/useAuth'
import useConnection from './hooks/useConnection'
import useStageSelector from './hooks/useStageSelector'
import useMediasoup from './hooks/useMediasoup'
import useAudioContext, { AudioContextProvider } from './hooks/useAudioContext'
import useAudioRenderer, { AudioRenderProvider } from './hooks/useAudioRenderer'
import useAnimationFrame from './hooks/useAnimationFrame'

export * from '@digitalstage/api-types'
export * from './redux/reducers'

export type { ReducerAction, AuthUser }

export {
    // React specific
    DigitalStageProvider,
    useDigitalStage,
    useConnection,
    useMediasoup,
    useAnimationFrame,
    AudioContextProvider,
    useAudioContext,
    AudioRenderProvider,
    useAudioRenderer,
    useAuth,
    ErrorCodes,
    AuthError,
    useStageSelector,
    // Redux specific
    registerSocketHandler,
    store,
    // Helpers
    getInitialDevice,
}
