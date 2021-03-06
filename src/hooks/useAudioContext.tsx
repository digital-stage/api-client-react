import React, { Context, createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
    AudioContext as StandardizedAudioContext,
    IAudioContext,
    IMediaStreamAudioDestinationNode,
} from 'standardized-audio-context'
import debug from 'debug'
import useStageSelector from './useStageSelector'

const report = debug('useAudioContext')
const reportWarning = report.extend('warn')

interface AudioContextProps {
    audioContext?: IAudioContext
    started?: boolean
    start: () => void
    destination?: IMediaStreamAudioDestinationNode<IAudioContext>
    setSampleRate: React.Dispatch<React.SetStateAction<number | undefined>>
}

const AudioContext: Context<AudioContextProps> = createContext<AudioContextProps>({
    start: () => {
        throw new Error('Please wrap your DOM tree with AudioContextProvider')
    },
    setSampleRate: () => {
        throw new Error('Please wrap your DOM tree with AudioContextProvider')
    },
})

/**
 * Create audio buffer with fallback for safari
 */
const createBuffer = (sampleRate?: number): IAudioContext => {
    let context = new StandardizedAudioContext({
        latencyHint: 'interactive',
    })
    if (/(iPhone|iPad)/i.test(navigator.userAgent)) {
        const desiredSampleRate: number =
            sampleRate && typeof sampleRate === 'number' ? sampleRate : 44100
        if (context.sampleRate !== desiredSampleRate) {
            const buffer = context.createBuffer(1, 1, desiredSampleRate)
            const dummy = context.createBufferSource()
            dummy.buffer = buffer
            dummy.connect(context.destination)
            dummy.start(0)
            dummy.disconnect()

            context.close() // dispose old context
            context = new StandardizedAudioContext({
                latencyHint: 'interactive',
            })
        }
    }
    return context
}

const startAudioContext = async (
    audioContext: IAudioContext,
    audio: HTMLAudioElement
): Promise<void> => {
    if (audioContext.state === 'suspended') {
        return audioContext.resume().then(() => {
            if (audio.paused) return audio.play()
            return undefined
        })
    }
    return Promise.resolve()
}

const AudioContextProvider = (props: { children: React.ReactNode }): JSX.Element => {
    const { children } = props
    const [audioContext, setAudioContext] = useState<IAudioContext | undefined>(undefined)
    const [destination, setDestination] = useState<
        IMediaStreamAudioDestinationNode<IAudioContext> | undefined
    >()
    const [started, setStarted] = useState<boolean>(false)
    const [sampleRate, setSampleRate] = useState<number>()
    const [audio, setAudio] = useState<HTMLAudioElement>()
    const sinkId = useStageSelector<string | undefined>(
        (state) =>
            state.globals.localDeviceId &&
            state.devices.byId[state.globals.localDeviceId].outputAudioDeviceId
    )

    /**
     * (Re)create audio context with desired sample rate
     */
    useEffect(() => {
        report('(Re)create audio context')
        setStarted(false)
        if (sampleRate) report(`Using sample rate of ${sampleRate}`)
        const standardizedAudioContext: IAudioContext = createBuffer(sampleRate)
        const createdDestination = standardizedAudioContext.createMediaStreamDestination()
        const createdAudio = new Audio()
        createdAudio.autoplay = true
        createdAudio.srcObject = createdDestination.stream
        // createdAudio.play().catch((err) => reportWarning(err));
        setAudio(createdAudio)
        setAudioContext(standardizedAudioContext)
        setDestination(createdDestination)

        // Try to start audio context manually
        startAudioContext(standardizedAudioContext, createdAudio)
            .then(() => {
                report('Started audio context automatically')
                setStarted(true)
                return undefined
            })
            .catch((err) => reportWarning(err))

        return () => {
            report('Closing audio context')
            setStarted(false)
            createdAudio.srcObject = null
            setAudio(undefined)
            createdDestination.disconnect()
            setDestination(undefined)
            standardizedAudioContext.close().catch((error) => reportWarning(error))
            setAudioContext(undefined)
        }
    }, [sampleRate])

    /**
     * React to output device change
     */
    useEffect(() => {
        if (audio && sinkId) {
            report('useEffect - sinkId | audio')
            if ((audio as any).sinkId !== undefined) {
                report(`Set sink Id to ${sinkId}`)
                ;(audio as any).setSinkId(sinkId)
            }
        }
    }, [sinkId, audio])

    const start = useCallback(async () => {
        report('Manual start triggered')
        if (audioContext && audio) {
            return startAudioContext(audioContext, audio)
                .then(() => {
                    report('Started audio context manually')
                    setStarted(true)
                    return undefined
                })
                .catch((err) => reportWarning(err))
        }
        return undefined
    }, [audioContext, audio])

    /**
     * Try to start audio context with touch gesture on mobile devices
     */
    useEffect(() => {
        if (
            audioContext &&
            audioContext.state === 'suspended' &&
            'ontouchstart' in window &&
            audio
        ) {
            report('Add touch handler to start audio context')
            const resume = () =>
                startAudioContext(audioContext, audio)
                    .then(() => {
                        report('Started audio context via touch gesture')
                        setStarted(true)
                        return undefined
                    })
                    .catch((err) => reportWarning(err))
            document.body.addEventListener('touchstart', resume, false)
            document.body.addEventListener('touchend', resume, false)
            return () => {
                report('Removed touch handler to start audio context')
                document.body.removeEventListener('touchstart', resume)
                document.body.removeEventListener('touchend', resume)
            }
        }
        return undefined
    }, [audioContext, audio])

    /**
     * Sync started boolean when audio context changed internally
     */
    useEffect(() => {
        if (audioContext) {
            if (audioContext.state !== 'running') {
                const handleStateChange = () => {
                    setStarted(audioContext.state === 'running')
                }
                audioContext.addEventListener('statechanged', handleStateChange)
                return () => {
                    audioContext.removeEventListener('statechanged', handleStateChange)
                }
            }
        } else {
            setStarted(false)
        }
        return undefined
    }, [audioContext])

    return (
        <AudioContext.Provider
            value={{
                audioContext,
                started,
                destination,
                start,
                setSampleRate,
            }}
        >
            {children}
        </AudioContext.Provider>
    )
}

const useAudioContext = (): AudioContextProps => useContext<AudioContextProps>(AudioContext)

export { AudioContextProvider }
export default useAudioContext
