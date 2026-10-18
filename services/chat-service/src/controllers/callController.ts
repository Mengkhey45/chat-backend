import crypto from 'node:crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';

const CREDENTIAL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * ICE servers for the browser's RTCPeerConnection.
 *
 * STUN alone lets two peers find each other on most home networks. TURN relays
 * the media when they can't connect directly (symmetric NAT, strict corporate
 * firewalls, some mobile carriers) — roughly 10-20% of real calls. Without a
 * TURN server those calls simply fail to connect.
 *
 * Two ways to configure TURN:
 *   TURN_URL + TURN_SECRET              -> ephemeral HMAC credentials (preferred)
 *   TURN_URL + TURN_USERNAME + TURN_CREDENTIAL -> static credentials
 */
export const getIceServers = (req: AuthenticatedRequest, res: Response) => {
  const iceServers: any[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  const turnUrl = process.env.TURN_URL;

  if (turnUrl && process.env.TURN_SECRET) {
    // coturn's "REST API" scheme: the username is an expiry timestamp and the
    // credential is its HMAC. Short-lived, so a leaked credential from the
    // browser can't be used to relay traffic indefinitely.
    const expiry = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
    const username = `${expiry}:${req.user?.userId ?? 'anon'}`;
    const credential = crypto
      .createHmac('sha1', process.env.TURN_SECRET)
      .update(username)
      .digest('base64');

    iceServers.push({ urls: turnUrl.split(',').map((u) => u.trim()), username, credential });
  } else if (turnUrl && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: turnUrl.split(',').map((u) => u.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  res.json({
    iceServers,
    // Lets the client warn the user that calls may fail on restrictive networks.
    hasTurn: Boolean(turnUrl),
  });
};
