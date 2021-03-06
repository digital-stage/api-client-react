import mediasoupClient from 'mediasoup-client'
import { ITeckosClient } from 'teckos-client'
import debug from 'debug'
import {
    AudioTrack,
    ClientDeviceEvents,
    ClientDevicePayloads,
    MediasoupAudioTrack,
    MediasoupDevice,
    MediasoupVideoTrack,
    VideoTrack,
    WebMediaDevice,
} from '@digitalstage/api-types'
import { Device } from 'mediasoup-client/lib/Device'
import { Producer } from 'mediasoup-client/lib/Producer'

const report = debug('oldUseMediasoup:utils')
const reportError = report.extend('error')

export enum RouterEvents {
    TransportCloses = 'transport-closed',
    ProducerCreated = 'producer-created',
    ProducerPaused = 'producer-paused',
    ProducerResumed = 'producer-resumed',
    ProducerCloses = 'producer-closed',
    ConsumerCreated = 'consumer-created',
    ConsumerPaused = 'consumer-paused',
    ConsumerResumed = 'consumer-resumed',
    ConsumerCloses = 'consumer-closed',
}

export enum RouterRequests {
    GetRTPCapabilities = 'rtp-capabilities',
    CreateTransport = 'create-transport',
    ConnectTransport = 'connect-transport',
    CloseTransport = 'close-transport',
    CreateProducer = 'create-producer',
    PauseProducer = 'pause-producer',
    ResumeProducer = 'resume-producer',
    CloseProducer = 'close-producer',
    CreateConsumer = 'create-consumer',
    PauseConsumer = 'pause-consumer',
    ResumeConsumer = 'resume-consumer',
    CloseConsumer = 'close-consumer',
}

export const RouterGetUrls = {
    GetRTPCapabilities: '/rtp-capabilities',

    CreateTransport: '/transport/webrtc/create',

    CreatePlainTransport: '/transport/plain/create',
}

export const RouterPostUrls = {
    ConnectTransport: '/transport/webrtc/connect',
    CloseTransport: '/transport/webrtc/close',

    ConnectPlainTransport: '/transport/plain/connect',
    ClosePlainTransport: '/transport/plain/close',

    // Auth required:
    CreateProducer: '/producer/create',
    PauseProducer: '/producer/pause',
    ResumeProducer: '/producer/resume',
    CloseProducer: '/producer/close',

    // Auth required:
    CreateConsumer: '/consumer/create',
    PauseConsumer: '/consumer/pause',
    ResumeConsumer: '/consumer/resume',
    CloseConsumer: '/consumer/close',
}

export const getVideoTracks = (inputVideoDeviceId?: string): Promise<MediaStreamTrack[]> =>
    navigator.mediaDevices
        .getUserMedia({
            audio: false,
            video: inputVideoDeviceId
                ? {
                      deviceId: inputVideoDeviceId,
                      width: { max: 640 },
                      height: { max: 640 },
                  }
                : {
                      width: { max: 640 },
                      height: { max: 640 },
                  },
        })
        .then((stream) => stream.getVideoTracks())

export const getAudioTracks = (options: {
    inputAudioDeviceId?: string
    sampleRate?: number
    autoGainControl?: boolean
    echoCancellation?: boolean
    noiseSuppression?: boolean
}): Promise<MediaStreamTrack[]> => {
    const audioOptions = {
        deviceId: options.inputAudioDeviceId || undefined,
        sampleRate: options.sampleRate || undefined,
        autoGainControl: options.autoGainControl || false,
        echoCancellation: options.echoCancellation || false,
        noiseSuppression: options.noiseSuppression || false,
    }
    report('Using following audio options: ', options)
    return navigator.mediaDevices
        .getUserMedia({
            video: false,
            audio: audioOptions,
        })
        .then((stream) => stream.getAudioTracks())
}

export const getRTPCapabilities = (routerConnection: ITeckosClient) => {
    return new Promise<mediasoupClient.types.RtpCapabilities>((resolve, reject) => {
        routerConnection.emit(
            RouterRequests.GetRTPCapabilities,
            {},
            (error: string, retrievedRtpCapabilities: mediasoupClient.types.RtpCapabilities) => {
                if (error) {
                    reject(new Error(error))
                }
                resolve(retrievedRtpCapabilities)
            }
        )
    })
}

export const createWebRTCTransport = (
    routerConnection: ITeckosClient,
    device: mediasoupClient.Device,
    direction: 'send' | 'receive'
): Promise<mediasoupClient.types.Transport> =>
    new Promise<mediasoupClient.types.Transport>((resolve, reject) => {
        routerConnection.emit(
            RouterRequests.CreateTransport,
            {},
            (error: string, transportOptions: mediasoupClient.types.TransportOptions) => {
                if (error) {
                    return reject(error)
                }
                report('createWebRTCTransport')
                const transport: mediasoupClient.types.Transport =
                    direction === 'send'
                        ? device.createSendTransport(transportOptions)
                        : device.createRecvTransport(transportOptions)
                transport.on('connect', async ({ dtlsParameters }, callback, errCallback) => {
                    report(`createWebRTCTransport:transport:${direction}:connect`)
                    routerConnection.emit(
                        RouterRequests.ConnectTransport,
                        {
                            transportId: transport.id,
                            dtlsParameters,
                        },
                        (transportError: string) => {
                            if (transportError) {
                                reportError(error)
                                return errCallback(error)
                            }
                            return callback()
                        }
                    )
                })
                transport.on('connectionstatechange', async (state) => {
                    if (state === 'closed' || state === 'failed' || state === 'disconnected') {
                        reportError(
                            `createWebRTCTransport:transport:${direction}:connectionstatechange - Disconnect by server side`
                        )
                    }
                })
                if (direction === 'send') {
                    transport.on('produce', async (producer, callback, errCallback) => {
                        report(`createWebRTCTransport:transport:${direction}:produce`)
                        routerConnection.emit(
                            RouterRequests.CreateProducer,
                            {
                                transportId: transport.id,
                                kind: producer.kind,
                                rtpParameters: producer.rtpParameters,
                                appData: producer.appData,
                            },
                            (produceError: string | undefined, payload: any) => {
                                if (produceError) {
                                    reportError(produceError)
                                    return errCallback(produceError)
                                }
                                return callback({
                                    ...producer,
                                    id: payload.id,
                                })
                            }
                        )
                    })
                }
                return resolve(transport)
            }
        )
    })

export const createProducer = (
    transport: mediasoupClient.types.Transport,
    track: MediaStreamTrack
): Promise<mediasoupClient.types.Producer> =>
    transport.produce({
        track,
        appData: {
            trackId: track.id,
        },
    })
export const pauseProducer = (
    socket: ITeckosClient,
    producer: mediasoupClient.types.Producer
): Promise<mediasoupClient.types.Producer> =>
    new Promise<mediasoupClient.types.Producer>((resolve, reject) =>
        socket.emit(RouterRequests.PauseProducer, producer.id, (error?: string) => {
            if (error) {
                reportError(error)
                return reject(error)
            }
            producer.pause()
            report(`Paused producer ${producer.id}`)
            return resolve(producer)
        })
    )

export const resumeProducer = (
    socket: ITeckosClient,
    producer: mediasoupClient.types.Producer
): Promise<mediasoupClient.types.Producer> =>
    new Promise<mediasoupClient.types.Producer>((resolve, reject) =>
        socket.emit(RouterRequests.ResumeProducer, producer.id, (error?: string) => {
            if (error) {
                reportError(error)
                return reject(error)
            }
            producer.resume()
            report(`Resumed producer ${producer.id}`)
            return resolve(producer)
        })
    )

export const stopProducer = (
    socket: ITeckosClient,
    producer: mediasoupClient.types.Producer
): Promise<mediasoupClient.types.Producer> =>
    new Promise<mediasoupClient.types.Producer>((resolve, reject) =>
        socket.emit(RouterRequests.CloseProducer, producer.id, (error?: string) => {
            if (error) {
                reportError(error)
                return reject(error)
            }
            producer.close()
            report(`Stopped producer ${producer.id}`)
            return resolve(producer)
        })
    )

export const createConsumer = (
    socket: ITeckosClient,
    device: mediasoupClient.Device,
    transport: mediasoupClient.types.Transport,
    producerId: string
): Promise<mediasoupClient.types.Consumer> =>
    new Promise<mediasoupClient.types.Consumer>((resolve, reject) => {
        socket.emit(
            RouterRequests.CreateConsumer,
            {
                producerId,
                transportId: transport.id,
                rtpCapabilities: device.rtpCapabilities, // TODO: Necessary?
            },
            async (
                error: string | null,
                data: {
                    id: string
                    producerId: string
                    kind: 'audio' | 'video'
                    rtpParameters: mediasoupClient.types.RtpParameters
                    paused: boolean
                    type: 'simple' | 'simulcast' | 'svc' | 'pipe'
                }
            ) => {
                if (error) {
                    reportError(error)
                    return reject(error)
                }
                report(
                    `Server created consumer ${data.id} for producer ${data.producerId}, consuming now`
                )
                return transport.consume(data).then(async (consumer) => {
                    if (data.paused) {
                        report('Pausing consumer, since it is paused server-side too')
                        await consumer.pause()
                    }
                    return resolve(consumer)
                })
            }
        )
    })

export const resumeConsumer = (
    routerConnection: ITeckosClient,
    consumer: mediasoupClient.types.Consumer
): Promise<mediasoupClient.types.Consumer> => {
    if (consumer.paused) {
        return new Promise<mediasoupClient.types.Consumer>((resolve, reject) =>
            routerConnection.emit(RouterRequests.ResumeConsumer, consumer.id, (error?: string) => {
                if (error) return reject(error)
                consumer.resume()
                report(`Resumed consumer ${consumer.id}`)
                return resolve(consumer)
            })
        )
    }
    return Promise.reject(new Error('Consumer is paused yet'))
}

export const pauseConsumer = (
    socket: ITeckosClient,
    consumer: mediasoupClient.types.Consumer
): Promise<mediasoupClient.types.Consumer> => {
    if (!consumer.paused) {
        return new Promise<mediasoupClient.types.Consumer>((resolve, reject) =>
            socket.emit(RouterRequests.PauseConsumer, consumer.id, (error?: string) => {
                if (error) {
                    reportError(error)
                    return reject(error)
                }
                consumer.pause()
                report(`Paused consumer ${consumer.id}`)
                return resolve(consumer)
            })
        )
    }
    return Promise.reject(new Error('Consumer is not paused'))
}

export const closeConsumer = (
    socket: ITeckosClient,
    consumer: mediasoupClient.types.Consumer
): Promise<mediasoupClient.types.Consumer> =>
    new Promise<mediasoupClient.types.Consumer>((resolve, reject) =>
        socket.emit(RouterRequests.CloseConsumer, consumer.id, (error?: string) => {
            if (error) {
                reportError(error)
                return reject(error)
            }
            consumer.close()
            report(`Closed consumer ${consumer.id}`)
            return resolve(consumer)
        })
    )

export const produce = (
    sendTransport: mediasoupClient.types.Transport,
    track: MediaStreamTrack
): Promise<mediasoupClient.types.Producer> => {
    report(`Creating producer for track ${track.id}`)
    if (!track) throw new Error('Could not create producer: Track is undefined')
    return createProducer(sendTransport, track).then((producer) => {
        if (producer.paused) {
            report(`Producer ${producer.id} is paused`)
        }
        return producer
    })
}

export const publishProducer = (
    apiConnection: ITeckosClient,
    stageId: string,
    producer: Producer
) =>
    new Promise<MediasoupVideoTrack | MediasoupAudioTrack>((resolve, reject) => {
        let payload: ClientDevicePayloads.CreateVideoTrack & ClientDevicePayloads.CreateAudioTrack =
            {
                type: 'mediasoup',
                stageId,
                producerId: producer.id,
            }
        if (producer.kind === 'audio') {
            payload = {
                ...payload,
                y: -1,
                rZ: 0,
            }
        }
        apiConnection.emit(
            producer.kind === 'video'
                ? ClientDeviceEvents.CreateVideoTrack
                : ClientDeviceEvents.CreateAudioTrack,
            payload,
            (error: string | null, track?: VideoTrack | AudioTrack) => {
                if (error) {
                    return reject(error)
                }
                if (!track) {
                    return reject(new Error('No video track provided by server'))
                }
                if (producer.kind === 'audio') {
                    return resolve(track as MediasoupAudioTrack)
                }
                return resolve(track as MediasoupVideoTrack)
            }
        )
    })

export const consume = (
    routerConnection: ITeckosClient,
    receiveTransport: mediasoupClient.types.Transport,
    device: mediasoupClient.Device,
    producerId: string
): Promise<mediasoupClient.types.Consumer> => {
    report(`Consuming ${producerId}`)
    return createConsumer(routerConnection, device, receiveTransport, producerId).then(
        async (localConsumer) => {
            report(`Created consumer ${localConsumer.id} to consume ${producerId}`)
            if (localConsumer.paused) {
                report(`Consumer ${localConsumer.id} is paused, try to resume it`)
                await resumeConsumer(routerConnection, localConsumer)
            }
            if (localConsumer.paused) {
                reportError(`Consumer ${localConsumer.id} is still paused after resume`)
            }
            return localConsumer
        }
    )
}

export const connect = (
    routerConnection: ITeckosClient
): Promise<{
    device: mediasoupClient.types.Device
    sendTransport: mediasoupClient.types.Transport
    receiveTransport: mediasoupClient.types.Transport
}> => {
    const device = new Device()
    return getRTPCapabilities(routerConnection)
        .then((rtpCapabilities) => device.load({ routerRtpCapabilities: rtpCapabilities }))
        .then(() =>
            Promise.all([
                createWebRTCTransport(routerConnection, device, 'send'),
                createWebRTCTransport(routerConnection, device, 'receive'),
            ])
        )
        .then((transports) => ({
            device,
            sendTransport: transports[0],
            receiveTransport: transports[1],
        }))
}

export const enumerateDevices = (): Promise<{
    inputAudioDevices: WebMediaDevice[]
    inputVideoDevices: WebMediaDevice[]
    outputAudioDevices: WebMediaDevice[]
}> =>
    new Promise<{
        inputAudioDevices: WebMediaDevice[]
        inputVideoDevices: WebMediaDevice[]
        outputAudioDevices: WebMediaDevice[]
    }>((resolve) => {
        if (!navigator) {
            return resolve({
                inputAudioDevices: [],
                inputVideoDevices: [],
                outputAudioDevices: [],
            })
        }
        return navigator.mediaDevices.enumerateDevices().then((devices) => {
            const inputVideoDevices: WebMediaDevice[] = []
            const inputAudioDevices: WebMediaDevice[] = []
            const outputAudioDevices: WebMediaDevice[] = []
            devices.forEach((device, index) => {
                switch (device.kind) {
                    case 'videoinput':
                        inputVideoDevices.push({
                            id:
                                device.deviceId ||
                                (inputVideoDevices.length === 1 ? 'default' : index.toString()),
                            label: device.label ? device.label : 'Standard',
                        })
                        break
                    case 'audioinput':
                        inputAudioDevices.push({
                            id:
                                device.deviceId ||
                                (inputAudioDevices.length === 1 ? 'default' : index.toString()),
                            label: device.label || 'Standard',
                        })
                        break
                    default:
                        outputAudioDevices.push({
                            id:
                                device.deviceId ||
                                (outputAudioDevices.length === 1 ? 'default' : index.toString()),
                            label: device.label || 'Standard',
                        })
                        break
                }
            })
            return resolve({
                inputAudioDevices,
                inputVideoDevices,
                outputAudioDevices,
            })
        })
    })

export const refreshMediaDevices = (
    currentDevice: MediasoupDevice,
    socket: ITeckosClient
): Promise<boolean> => {
    if (socket) {
        return enumerateDevices().then((devices) => {
            // Sync and update if necessary
            let shouldUpdate: boolean = false
            const update: ClientDevicePayloads.ChangeDevice = { _id: currentDevice._id }
            if (currentDevice.inputAudioDevices !== devices.inputAudioDevices) {
                shouldUpdate = true
                update.inputAudioDevices = devices.inputAudioDevices
            }
            if (currentDevice.inputVideoDevices !== devices.inputVideoDevices) {
                shouldUpdate = true
                update.inputVideoDevices = devices.inputVideoDevices
            }
            if (currentDevice.outputAudioDevices !== devices.outputAudioDevices) {
                shouldUpdate = true
                update.outputAudioDevices = devices.outputAudioDevices
            }
            if (shouldUpdate) {
                return socket.emit(ClientDeviceEvents.ChangeDevice, update)
            }
            return false
        })
    }
    return Promise.resolve(false)
}
