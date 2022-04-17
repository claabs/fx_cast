"use strict";

import logger from "../../lib/logger";

import {
    ReceiverDevice,
    ReceiverDeviceCapabilities as ReceiverDeviceCapabilities
} from "../../types";
import { ErrorCallback, SuccessCallback } from "../types";

import { onMessage, sendMessageResponse } from "../eventMessageChannel";

import {
    AutoJoinPolicy,
    Capability,
    DefaultActionPolicy,
    DialAppState,
    ErrorCode,
    ReceiverAction,
    ReceiverAvailability,
    ReceiverType,
    SenderPlatform,
    SessionStatus,
    VolumeControlType
} from "./enums";

import {
    ApiConfig,
    CredentialsData,
    DialRequest,
    Error as Error_,
    Image,
    Receiver,
    ReceiverDisplayStatus,
    SenderApplication,
    SessionRequest,
    Timeout,
    Volume
} from "./dataClasses";

import Session from "./Session";

type ReceiverActionListener = (
    receiver: Receiver,
    receiverAction: string
) => void;

type RequestSessionSuccessCallback = (session: Session) => void;

let apiConfig: Nullable<ApiConfig>;
let sessionRequest: Nullable<SessionRequest>;

let requestSessionSuccessCallback: Nullable<RequestSessionSuccessCallback>;
let requestSessionErrorCallback: Nullable<ErrorCallback>;

const receiverActionListeners = new Set<ReceiverActionListener>();

const receiverDevices = new Map<string, ReceiverDevice>();
const sessions = new Map<string, Session>();

export {
    AutoJoinPolicy,
    Capability,
    DefaultActionPolicy,
    DialAppState,
    ErrorCode,
    ReceiverAction,
    ReceiverAvailability,
    ReceiverType,
    SenderPlatform,
    SessionStatus,
    VolumeControlType
};

export {
    ApiConfig,
    CredentialsData,
    DialRequest,
    Error_ as Error,
    Image,
    Receiver,
    ReceiverDisplayStatus,
    SenderApplication,
    SessionRequest,
    Timeout,
    Volume,
    Session
};

export const VERSION = [1, 2];
export let isAvailable = false;

export const timeout = new Timeout();

// chrome.cast.media namespace
export * as media from "./media";

/**
 * Create `chrome.cast.Receiver` object from receiver device info.
 */
function createReceiver(device: ReceiverDevice) {
    // Convert capabilities bitflag to string array
    const capabilities: Capability[] = [];
    if (device.capabilities & ReceiverDeviceCapabilities.VIDEO_OUT) {
        capabilities.push(Capability.VIDEO_OUT);
    } else if (device.capabilities & ReceiverDeviceCapabilities.VIDEO_IN) {
        capabilities.push(Capability.VIDEO_IN);
    } else if (device.capabilities & ReceiverDeviceCapabilities.AUDIO_OUT) {
        capabilities.push(Capability.AUDIO_OUT);
    } else if (device.capabilities & ReceiverDeviceCapabilities.AUDIO_IN) {
        capabilities.push(Capability.AUDIO_IN);
    } else if (
        device.capabilities & ReceiverDeviceCapabilities.MULTIZONE_GROUP
    ) {
        capabilities.push(Capability.MULTIZONE_GROUP);
    }

    const receiver = new Receiver(device.id, device.friendlyName, capabilities);

    // Currently only supports CAST receivers
    receiver.receiverType = ReceiverType.CAST;

    return receiver;
}

function sendSessionRequest(
    sessionRequest: SessionRequest,
    receiverDevice: ReceiverDevice
) {
    for (const listener of receiverActionListeners) {
        listener(createReceiver(receiverDevice), ReceiverAction.CAST);
    }

    sendMessageResponse({
        subject: "bridge:createCastSession",
        data: {
            appId: sessionRequest.appId,
            receiverDevice: receiverDevice
        }
    });
}

export function initialize(
    newApiConfig: ApiConfig,
    successCallback?: SuccessCallback,
    errorCallback?: ErrorCallback
) {
    logger.info("cast.initialize");

    // Already initialized
    if (apiConfig) {
        errorCallback?.(new Error_(ErrorCode.INVALID_PARAMETER));
        return;
    }

    apiConfig = newApiConfig;

    sendMessageResponse({
        subject: "main:initializeCast",
        data: { appId: apiConfig.sessionRequest.appId }
    });

    successCallback?.();

    apiConfig.receiverListener(
        receiverDevices.size
            ? ReceiverAvailability.AVAILABLE
            : ReceiverAvailability.UNAVAILABLE
    );
}

export function requestSession(
    successCallback: RequestSessionSuccessCallback,
    errorCallback: ErrorCallback,
    newSessionRequest?: SessionRequest,
    receiverDevice?: ReceiverDevice
) {
    logger.info("cast.requestSession");

    // Not yet initialized
    if (!apiConfig) {
        errorCallback?.(new Error_(ErrorCode.API_NOT_INITIALIZED));
        return;
    }

    // Already requesting session
    if (sessionRequest) {
        errorCallback?.(
            new Error_(
                ErrorCode.INVALID_PARAMETER,
                "Session request already in progress."
            )
        );
        return;
    }

    // No receivers available
    if (!receiverDevices.size) {
        errorCallback?.(new Error_(ErrorCode.RECEIVER_UNAVAILABLE));
        return;
    }

    /**
     * Store session request for use in return message from
     * receiver selection.
     */
    sessionRequest = newSessionRequest ?? apiConfig.sessionRequest;

    requestSessionSuccessCallback = successCallback;
    requestSessionErrorCallback = errorCallback;

    /**
     * If a receiver was provided, skip the receiver selector
     * process.
     */
    if (receiverDevice) {
        if (receiverDevice?.id && receiverDevices.has(receiverDevice.id)) {
            sendSessionRequest(sessionRequest, receiverDevice);
        }
    } else {
        // Open receiver selector UI
        sendMessageResponse({
            subject: "main:selectReceiver"
        });
    }
}

export function requestSessionById(_sessionId: string): void {
    logger.info("STUB :: cast.requestSessionById");
}

export function setCustomReceivers(
    _receivers: Receiver[],
    _successCallback?: SuccessCallback,
    _errorCallback?: ErrorCallback
): void {
    logger.info("STUB :: cast.setCustomReceivers");
}

export function setPageContext(_win: Window): void {
    logger.info("STUB :: cast.setPageContext");
}

export function setReceiverDisplayStatus(_sessionId: string): void {
    logger.info("STUB :: cast.setReceiverDisplayStatus");
}

export function unescape(escaped: string): string {
    return window.decodeURI(escaped);
}

export function addReceiverActionListener(listener: ReceiverActionListener) {
    receiverActionListeners.add(listener);
}
export function removeReceiverActionListener(listener: ReceiverActionListener) {
    receiverActionListeners.delete(listener);
}

export function logMessage(message: string) {
    logger.info("cast.logMessage", message);
}

export function precache(_data: string) {
    logger.info("STUB :: cast.precache");
}

onMessage(message => {
    switch (message.subject) {
        case "cast:initialized": {
            isAvailable = true;
            break;
        }

        /**
         * Once the bridge detects a session creation, session info
         * and data needed to create cast API objects is sent.
         */
        case "cast:sessionCreated": {
            // Notify background to close UI
            sendMessageResponse({
                subject: "main:closeReceiverSelector"
            });

            const status = message.data;

            // TODO: Implement persistent per-origin receiver IDs
            const receiver1 = new Receiver(
                status.receiverId, //                            label
                status.receiverFriendlyName, //                  friendlyName
                [Capability.VIDEO_OUT, Capability.AUDIO_OUT], // capabilities
                status.volume //                                 volume
            );

            const receiverDevice = receiverDevices.get(status.receiverId);
            if (!receiverDevice) {
                logger.error(
                    `Could not find receiver device "${status.receiverFriendlyName}" (${status.receiverId})`
                );
                break;
            }

            const receiver = createReceiver(receiverDevice);
            receiver.volume = status.volume;
            receiver.displayStatus = new ReceiverDisplayStatus(
                status.statusText,
                status.appImages
            );

            const session = new Session(
                status.sessionId, //   sessionId
                status.appId, //       appId
                status.displayName, // displayName
                status.appImages, //   appImages
                receiver //            receiver
            );

            session.senderApps = status.senderApps;
            session.transportId = status.transportId;

            sessions.set(session.sessionId, session);
        }
        // eslint-disable-next-line no-fallthrough
        case "cast:sessionUpdated": {
            const status = message.data;
            const session = sessions.get(status.sessionId);
            if (!session) {
                logger.error(`Session not found (${status.sessionId})`);
                return;
            }

            session.statusText = status.statusText;
            session.namespaces = status.namespaces;
            session.receiver.volume = status.volume;

            /**
             * If session created via requestSession, the success
             * callback will be set, otherwise the session was created
             * by the extension and the session listener should be
             * called instead.
             */
            if (requestSessionSuccessCallback) {
                requestSessionSuccessCallback(session);
                requestSessionSuccessCallback = null;
                requestSessionErrorCallback = null;
            } else {
                apiConfig?.sessionListener(session);
            }

            break;
        }

        case "cast:sessionStopped": {
            const { sessionId } = message.data;
            const session = sessions.get(sessionId);
            if (session) {
                session.status = SessionStatus.STOPPED;

                const updateListeners = session?._updateListeners;
                if (updateListeners) {
                    for (const listener of updateListeners) {
                        listener(false);
                    }
                }
            }

            break;
        }

        case "cast:receivedSessionMessage": {
            const { sessionId, namespace, messageData } = message.data;
            const session = sessions.get(sessionId);
            if (session) {
                const _messageListeners = session._messageListeners;
                const listeners = _messageListeners.get(namespace);

                if (listeners) {
                    for (const listener of listeners) {
                        listener(namespace, messageData);
                    }
                }
            }

            break;
        }

        case "cast:impl_sendMessage": {
            const { sessionId, messageId, error } = message.data;

            const session = sessions.get(sessionId);
            if (!session) {
                break;
            }

            const callbacks = session._sendMessageCallbacks.get(messageId);
            if (callbacks) {
                const [successCallback, errorCallback] = callbacks;

                if (error) {
                    errorCallback?.(new Error_(error));
                    return;
                }

                successCallback?.();
            }

            break;
        }

        case "cast:receiverDeviceUp": {
            const { receiverDevice } = message.data;
            if (receiverDevices.has(receiverDevice.id)) {
                break;
            }

            receiverDevices.set(receiverDevice.id, receiverDevice);

            if (apiConfig) {
                // Notify listeners of new cast destination
                apiConfig.receiverListener(ReceiverAvailability.AVAILABLE);
            }

            break;
        }

        case "cast:receiverDeviceDown": {
            const { receiverDeviceId } = message.data;

            receiverDevices.delete(receiverDeviceId);

            if (receiverDevices.size === 0) {
                if (apiConfig) {
                    apiConfig.receiverListener(
                        ReceiverAvailability.UNAVAILABLE
                    );
                }
            }

            break;
        }

        case "cast:selectReceiver/selected": {
            logger.info("Selected receiver");

            if (sessionRequest) {
                sendSessionRequest(sessionRequest, message.data.receiverDevice);
                sessionRequest = null;
            }

            break;
        }

        case "cast:selectReceiver/stopped": {
            const { receiverDevice } = message.data;

            logger.info("Stopped receiver");

            if (sessionRequest) {
                sessionRequest = null;

                for (const listener of receiverActionListeners) {
                    listener(
                        // TODO: Use existing receiver object?
                        createReceiver(receiverDevice),
                        ReceiverAction.STOP
                    );
                }
            }

            break;
        }

        // Popup closed before session established
        case "cast:selectReceiver/cancelled": {
            if (sessionRequest) {
                sessionRequest = null;

                requestSessionErrorCallback?.(new Error_(ErrorCode.CANCEL));
            }

            break;
        }

        // Session request initiated via receiver selector
        case "cast:launchApp": {
            if (sessionRequest) {
                logger.error("Session request already in progress.");
                break;
            }
            if (!apiConfig?.sessionRequest) {
                logger.error("Session request not found!");
                break;
            }

            sendSessionRequest(
                apiConfig.sessionRequest,
                message.data.receiverDevice
            );

            break;
        }
    }
});
