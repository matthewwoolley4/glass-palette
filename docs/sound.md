# Sound settings that go with Glass Palette

The theme shows what is playing; these are the settings that make it sound right when a Sonos room is the speaker
over Spotify Connect. Nothing here is required by the theme, and none of it is theme-specific. It is written down
because getting these wrong is the usual reason a lossless stream still sounds flat.

## Spotify (desktop app, Settings)

| Setting | Value | Why |
| --- | --- | --- |
| Streaming quality | Lossless (or Very High if your plan has no Lossless) | the "Lossless" bead in the theme reads this straight from the player |
| Auto adjust quality | Off | it drops quality quietly on a busy network; better to hear a stutter once than lossy all evening |
| Normalize volume | Off | Spotify's limiter flattens dynamics; let the Sonos handle level |
| Crossfade | Off, AutoMix On | AutoMix beat-matches transitions on playlists that support it; a Connect speaker such as a Sonos generally runs its own track handoff, so the app's crossfade setting may not reach it |
| Gapless | On | albums play as albums |
| Mono audio | Off | folds left and right into one channel; only for single-ear listening or a speaker that cannot do stereo |

Check them from inside the app (any Spicetify install, Ctrl/Cmd+Shift+I console):

```js
(async () => { const S = Spicetify.Platform.SettingsAPI; const o = {}; for (const g of ['quality', 'playback']) { o[g] = {}; for (const k of Object.keys(S[g])) { try { if (S[g][k].getValue) o[g][k] = await S[g][k].getValue(); } catch (e) {} } } console.log(o); })()
```

`quality.streamingQuality: 5` is Lossless.

## Sonos (Sonos app, Settings > System > your room)

| Setting | Value | Why |
| --- | --- | --- |
| Trueplay | Run it once per room, again if you move the speaker | it measures the room and corrects the speaker for it; on a soundbar against a wall this is usually the biggest single change |
| EQ, bass and treble | 0 / 0 to start | a flat start lets Trueplay do its job; if the bass booms, take bass down 2 before you touch treble |
| Loudness | On for background listening, Off for sitting down to listen | it lifts bass and treble at low volume so quiet music does not sound thin, and at normal volume that lift is just extra bass |
| Speech Enhancement, Night Sound (soundbars) | Off for music | both squeeze the loud and quiet parts closer together, which is right for late-night TV and wrong for a song |
| Audio Compression (line-in only) | Uncompressed | only matters if something is plugged into the speaker's line-in; compression there is for multi-room latency, not quality |
| Sub and surrounds, if grouped | Level once with Trueplay, then leave them | changing their levels by ear per song fights the calibration |

**Play through Connect.** Pick the Sonos from Spotify's device menu (Spotify Connect), not from the Sonos app's
Spotify tile, and never by Bluetooth or AirPlay from a laptop. Connect has the speaker fetch the stream from
Spotify's servers itself, so the computer's volume, mixer and Bluetooth codec are out of the chain, the music keeps
playing if the computer sleeps, and the theme still shows and controls everything because Spotify is the remote.

## How the theme and the lights read the sound

- The "Lossless" bead in full screen is Spotify's own label from the dock; if it is missing, the stream is not lossless
  right now (network dip, or a track without a lossless master).
- Lyrics run from Spotify's line times plus a lead (`localStorage['office-glass-lyric-lead-ms']`, default 350), because
  a Connect speaker plays a little ahead of the app's own position. Adjust it until the highlight lands on the word.
- The beat swell uses Spotify's audio analysis for the track (bar and beat times); `office-glass-beat-offset-ms` shifts it
  the same way.
