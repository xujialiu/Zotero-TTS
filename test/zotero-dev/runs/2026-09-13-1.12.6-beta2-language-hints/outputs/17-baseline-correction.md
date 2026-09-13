# Baseline artifact correction

The bridge baseline executed before temporary changes returned:

    webdav.syncPositions: value=true, user=true
    webdav.autoUploadSettings: value=true, user=true
    webdav.syncSettings: value=false, user=false

The first saved sanitized outputs/01-baseline.json incorrectly transcribed autoUploadSettings as value=false,user=false. That was an artifact error, not a user change. The temporary mute script's own before snapshot also returned autoUploadSettings value=true,user=true. Final restoration returned value=true,user=true. No explicit user change was observed.

The baseline script did not capture the user's popupOpen or popup DOM state. During the run every popup close call was guarded by a disposable fixture item ID; no call targeted user item 24246. Final observation is popupOpen=false and popupDOM=false, so exact visibility restoration remains unproven.

Fish Speech Local was not run. The live Local PASS was Kokoro (local::af_bella) with a restored /dev/captioned_speech stub; issue #99 remains deferred.
