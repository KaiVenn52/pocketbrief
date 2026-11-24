# PocketBrief

Turn field notes into source-linked observations, actions and unanswered questions. Carry open items across shifts, including after a reload, and attach a resolution note when closing them. The model classifies numbered sources, and the app displays the original text for every source.

## Run

Requires Node 24.18+ and npm. From a standalone checkout, run `npm ci`, `npm test` and `npm run dev`. Open http://127.0.0.1:5174/. From the development workbench, use `npm run dev --workspace pocketbrief`.

## Offline handover

1. Run `npm run build` and `npm run preview`. Open http://127.0.0.1:5177/ and wait for **Offline ready**. Production hosting should use HTTPS.
2. Create the outgoing handover, record any resolutions and choose **Save open items**. The JSON file contains the remaining items and their source references.
3. On the next shift, reopen PocketBrief and choose **Open carryover file** before creating a new handover. Add the new field notes and keep carryover selected.

Use the local formatting option when working without a network or a verified device model. The service worker caches the production app shell on the first visit.

## Firebase AI Logic

Enable Firebase AI Logic with the Gemini Developer API in your Firebase project. Register the web app with App Check and configure the attestation key for your deployment domain. Copy `.env.example` to `.env.local` and supply the browser configuration for that project. Set `VITE_APPCHECK_PROVIDER=enterprise` for App Check with reCAPTCHA Enterprise, or `v3` for the classic provider.

The on-device option uses `ONLY_ON_DEVICE`. The opt-in hybrid option uses `PREFER_ON_DEVICE`, so the current note can be sent to Google when device inference is unavailable. Use a supported desktop Chrome installation for on-device inference. [Firebase hybrid setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)

For GitHub Pages, set the workflow's Firebase values as repository configuration. Keep `FIREBASE_WEB_API_KEY` in Actions secrets. Keep private debug tokens out of the client build and source repository.

## Data

Notes and history stay in tab memory. The app shell cache holds the HTML, CSS and JavaScript from the production build. Exports are plaintext files created at the user's request. Only the current field notes can be sent to Google in cloud fallback mode. The sample is synthetic.

## License

MIT. React, Vite and SDKs retain their respective licenses. Generated design concepts are references; the interface is implemented as native HTML/CSS/React, not a screenshot.
