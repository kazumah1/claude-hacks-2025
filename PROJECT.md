# DebateRef – Full Architecture & Roadmap (with Fact‑Check API)

## 1. Product Vision

**DebateRef** is a web app that sits “on top of” a debate like a broadcast graphics package:

* The **video (live or recorded) is full‑screen**.
* When someone says something questionable, a **popup overlay** appears over the video for a few seconds:

  * “Strawman”, “Appeal to Emotion”, “Likely false”, etc.
* Viewers can optionally open **side drawers**:

  * Left: full **transcript**.
  * Right: a **Fact Feed** with all claims, fallacies, and fact‑check results (with source links).

No agents, no loops — just a clean pipeline:

> audio → STT → segments → Claude → claims/fallacies → fact‑check API → verdict + sources → overlays + drawers.

We support two modes:

* **Live Mode** (`/live`): webcam + mic, near‑real‑time overlays.
* **Replay Mode** (`/replay`): preprocessed clip with synced overlays.

---

## 2. User Experience

### 2.1 Live Mode (`/live`)

Flow:

1. User opens `/live`.
2. Sees a fullscreen dark screen with a big **“Start Live Debate”** button.
3. Click → browser asks for camera + mic permissions.
4. Once granted:

   * Webcam feed fills the screen (`object-fit: cover`).
   * A top HUD appears:

     * `LIVE ●` indicator
     * Elapsed time (e.g. `01:23`)
     * Debate title/topic
     * Buttons: `Transcript`, `Fact Feed`
5. As two people debate:

   * Frontend (via STT SDK) receives short transcript segments with speaker labels & timestamps.
   * Each segment is sent to the backend:

     * Claude extracts **claims & fallacies**.
     * Fact‑check API evaluates **truthfulness** of factual claims.
   * When a “claim event” is ready:

     * A **popup overlay** appears on top of the video for ~5–8s, then disappears.
6. At any time:

   * Clicking **Transcript** slides in a left drawer with the full transcript.
   * Clicking **Fact Feed** slides in a right drawer with a scrollable list of all claims, fallacies, verdicts, and source links.

### 2.2 Replay Mode (`/replay`)

Flow:

1. User opens `/replay`.
2. Sees the same full‑screen design:

   * Center: a `<video>` player with a preloaded debate clip.
   * Top HUD: `REPLAY`, time, topic, `Transcript`, `Fact Feed`.
3. As the video plays:

   * Popups appear exactly at the times of precomputed claims.
   * Transcript drawer shows the full text; current line is highlighted based on video time.
   * Fact Feed drawer shows all events; clicking an item can optionally seek the video.

This mode is a **reliable fallback** for demoing, even if live STT is shaky, and is great for testing.

---

## 3. Architecture Overview

### 3.1 High‑Level Flow

For both Live and Replay:

1. **Audio ingestion**

   * Live: browser gets mic audio + uses STT SDK to get transcript segments.
   * Replay: offline script takes a video file → audio → STT → segments.

2. **Segment → Claims & Fallacies (Claude)**

   * One Claude call per segment:

     * Extract distinct claims & accusations.
     * Tag fallacies (strawman, ad hominem, etc).
     * Mark whether each claim needs external fact checking.

3. **Claim → Fact‑Check API**

   * For each `Claim` needing fact‑check:

     * Call an external fact‑checking API with the claim text.
     * Receive verdict (supported/disputed/likely false/uncertain) + evidence (titles, URLs, snippets).
   * Enrich `Claim` with `verdict`, `confidence`, `sources`, and optionally a short `reasoning`.

4. **Frontend Rendering**

   * Maintain `segments[]` + `claims[]` in state.
   * PopupManager:

     * For Replay: triggers popups when `currentTime >= claim.start`.
     * For Live: triggers popups as new claims arrive.
   * Drawers:

     * TranscriptDrawer shows `segments[]`.
     * FactFeedDrawer shows `claims[]` with details and sources.

No component calls tools; only the backend does STT, Claude, and the fact‑check API.

---

## 4. Data Model

### 4.1 Core Types (TypeScript)

```ts
type SpeakerId = string; // e.g. "spk_0", "spk_1"

interface SpeakerMap {
  [id: SpeakerId]: string; // { "spk_0": "Speaker A", "spk_1": "Speaker B" }
}

interface Segment {
  id: string;
  sessionId: string;     // live session id or clipId
  speaker: SpeakerId;
  start: number;         // seconds from start
  end: number;
  text: string;
}

type FallacyType =
  | "none"
  | "strawman"
  | "ad_hominem"
  | "appeal_to_emotion"
  | "false_dilemma"
  | "hasty_generalization"
  | "slippery_slope"
  | "other";

type VerdictType =
  | "not_checked"
  | "supported"
  | "disputed"
  | "likely_false"
  | "uncertain";

interface FactSource {
  title: string;
  url: string;
  snippet: string;
}

interface Claim {
  id: string;
  sessionId: string;
  segmentId: string;
  speaker: SpeakerId;
  start: number;
  end: number;
  text: string;              // the claim text, not full segment
  fallacy: FallacyType;
  needsFactCheck: boolean;

  verdict: VerdictType;      // from fact-check API
  confidence?: number;       // 0–1 if available
  reasoning?: string;        // short summary
  sources?: FactSource[];    // supporting/contradicting sources
}

interface ClipAnalysis {
  clipId: string;
  title: string;
  videoUrl: string;
  speakers: SpeakerMap;
  segments: Segment[];
  claims: Claim[];
}
```

### 4.2 Backend Models (Python/Pydantic)

You can mirror the above as:

```py
class SegmentModel(BaseModel):
    id: str
    sessionId: str
    speaker: str
    start: float
    end: float
    text: str

class FactSourceModel(BaseModel):
    title: str
    url: str
    snippet: str

class ClaimModel(BaseModel):
    id: str
    sessionId: str
    segmentId: str
    speaker: str
    start: float
    end: float
    text: str
    fallacy: str
    needsFactCheck: bool
    verdict: str
    confidence: float | None = None
    reasoning: str | None = None
    sources: list[FactSourceModel] | None = None

class LiveSessionState(BaseModel):
    sessionId: str
    startedAt: float
    speakers: dict[str, str]
    segments: list[SegmentModel] = []
    claims: list[ClaimModel] = []
```

And an in‑memory store:

```py
SESSIONS: dict[str, LiveSessionState] = {}
```

---

## 5. External Services

### 5.1 STT + Diarization

* Any STT provider that can:

  * From live audio: emit segments `{ text, speaker, startSec, endSec }`.
  * From audio file (for replay preprocessing): emit similar segments.
* Use their JS SDK on the frontend for live if possible, or call from backend.

### 5.2 Claude (Segment → Claims & Fallacies)

* For each `Segment`, call Claude once to get JSON with list of claims and associated fallacies + `needs_fact_check`.

### 5.3 Fact‑Check API (Claim → Verdict + Sources)

* Given `claim.text`, call an external fact‑check API.
* Expected response (you can adapt to match the actual API):

```json
{
  "verdict": "supported | disputed | likely_false | uncertain",
  "confidence": 0.0-1.0,
  "sources": [
    {
      "title": "Some article",
      "url": "https://...",
      "snippet": "Excerpt mentioning the relevant fact..."
    }
  ],
  "reasoning": "Short explanation of why."
}
```

Backend wraps this into `FactSourceModel` and populates `Claim.verdict`, `Claim.sources`, `Claim.reasoning`, etc.

---

## 6. Backend Endpoints

All endpoints are **single‑shot** and stateless per call (except for in‑memory session storage).

### 6.1 `/api/live/start` – Start a live session

**Method:** `POST`
**Request body (optional):**

```json
{
  "speakers": {
    "spk_0": "Speaker A",
    "spk_1": "Speaker B"
  }
}
```

**Response:**

```json
{
  "sessionId": "live_abc123",
  "speakers": {
    "spk_0": "Speaker A",
    "spk_1": "Speaker B"
  }
}
```

Implementation:

* Generate `sessionId`.
* Initialize `LiveSessionState` and store in `SESSIONS`.

---

### 6.2 `/api/analyze-segment` – Segment → Claims (with fact check)

**Method:** `POST`
**Body:**

```json
{
  "id": "seg_1",
  "sessionId": "live_abc123",
  "speaker": "spk_0",
  "start": 12.3,
  "end": 15.8,
  "text": "I think Cuomo wants to abolish all policing."
}
```

**Steps:**

1. Ensure `LiveSessionState` exists for `sessionId`.
2. Call Claude with segment prompt (see §7) → `claims[]` with `fallacy`, `needs_fact_check`.
3. For each claim:

   * Build a `ClaimModel` with `verdict = "not_checked"` initially.
   * If `needsFactCheck`, call fact‑check API and fill `verdict`, `confidence`, `reasoning`, `sources`.
4. Append `SegmentModel` and `ClaimModel`s to `session`.
5. Return list of `ClaimModel` as JSON.

---

### 6.3 `/api/live/state?sessionId=...` – (Optional) Fetch current live state

**Method:** `GET`
**Response:** `LiveSessionState` JSON:

```json
{
  "sessionId": "live_abc123",
  "startedAt": 1710000000,
  "speakers": { "spk_0": "Speaker A", "spk_1": "Speaker B" },
  "segments": [ ... ],
  "claims": [ ... ]
}
```

Primarily used for:

* Drawer contents (transcript & fact feed).
* As a fallback for missed live updates.

---

### 6.4 Replay Preprocessing Script (Offline, not HTTP)

Script steps:

1. Read transcript (from STT or manually prepared).
2. Build `Segment[]` (id, speaker, start, end, text).
3. For each segment:

   * Call `/api/analyze-segment` (or the underlying function) to get claims.
4. Aggregate into `ClipAnalysis` object.
5. Write JSON to `public/data/demo_clip.json`.

---

## 7. Claude Prompt (Segment → Claims/Fallacies)

**System message:**

> You analyze short segments of political or policy debates.
> For each segment, you:
>
> 1. Extract meaningful claims or accusations.
> 2. Tag logical fallacies present in each claim.
> 3. Mark whether the claim should be fact-checked.
>    Respond ONLY with strict JSON.

**User template:**

```text
Analyze this debate segment.

Metadata:
- Session or Clip ID: {{session_id}}
- Segment ID: {{segment_id}}
- Speaker ID: {{speaker_id}}
- Start time: {{start}} seconds
- End time: {{end}} seconds

Transcript:
"{{segment_text}}"

Tasks:
1. Identify each distinct CLAIM or accusation in this segment.
2. For each claim, assign:
   - "fallacy": one of
     ["none","strawman","ad_hominem","appeal_to_emotion",
      "false_dilemma","hasty_generalization","slippery_slope","other"]
   - "needs_fact_check": true if it asserts something about reality
     (events, numbers, policies, what someone did or said, etc.).
3. Optionally describe overall tone in "meta.tone" as a short phrase.

Return ONLY valid JSON:

{
  "claims": [
    {
      "text": "string",
      "fallacy": "none | strawman | ad_hominem | appeal_to_emotion | false_dilemma | hasty_generalization | slippery_slope | other",
      "needs_fact_check": true
    }
  ],
  "meta": {
    "tone": "optional short descriptor like 'calm', 'angry', 'sarcastic'"
  }
}
```

Backend parses this and maps each item to a `ClaimModel` before fact checking.

---

## 8. Frontend Architecture & Components

### 8.1 Global Layout (Both Modes)

Top‑level `DebateStage` component:

```tsx
<div className="relative w-screen h-screen bg-black overflow-hidden">
  <VideoLayer ... />
  <HUD ... />

  <PopupManager claims={claims} currentTime={currentTime} mode={mode} />

  <TranscriptDrawer
    isOpen={showTranscript}
    onClose={...}
    segments={segments}
    speakers={speakers}
    currentTime={currentTime}
    mode={mode}
    onSeek={(t) => seekVideo(t)} // replay only
  />

  <FactFeedDrawer
    isOpen={showFactFeed}
    onClose={...}
    claims={claims}
    speakers={speakers}
    currentTime={currentTime}
  />
</div>
```

### 8.2 VideoLayer

* Live:

  * `getUserMedia({ video: true, audio: true })`
  * `videoRef.current.srcObject = stream`
* Replay:

  * `<video src={analysis.videoUrl} controls onTimeUpdate={...} />`

Always styled as:

```tsx
<video
  className="absolute inset-0 w-full h-full object-cover"
  ...
/>
```

### 8.3 HUD

Top overlay:

* Left: `LIVE ●` or `REPLAY`, elapsed time.
* Right: buttons `Transcript`, `Fact Feed`.

```tsx
const HUD = ({ mode, elapsed, onToggleTranscript, onToggleFactFeed }) => (
  <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between items-center px-4 md:px-8 py-4 text-xs md:text-sm text-slate-100">
    <div className="pointer-events-auto flex items-center gap-2">
      <span className="flex items-center gap-1 rounded-full bg-red-500/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide">
        <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
        {mode === "live" ? "Live" : "Replay"}
      </span>
      <span className="text-slate-300 tabular-nums">{formatTime(elapsed)}</span>
    </div>
    <div className="hidden md:block text-slate-200 font-medium">
      Universal Healthcare Debate
    </div>
    <div className="pointer-events-auto flex items-center gap-2">
      <button onClick={onToggleTranscript} className="rounded-full bg-slate-900/80 px-3 py-1 text-xs hover:bg-slate-800">
        Transcript
      </button>
      <button onClick={onToggleFactFeed} className="rounded-full bg-slate-900/80 px-3 py-1 text-xs hover:bg-slate-800">
        Fact Feed
      </button>
    </div>
  </div>
);
```

### 8.4 PopupManager & Popup Components

State:

```ts
const [visiblePopups, setVisiblePopups] = useState<PopupInstance[]>([]);

interface PopupInstance {
  id: string;
  claimId: string;
  kind: "side" | "bottom";
  createdAt: number;
  durationMs: number;
}
```

Logic:

* In **Replay**, on each `currentTime` update:

  * For any claim with `start <= currentTime` and not yet shown, create a PopupInstance.
* In **Live**, whenever `/api/analyze-segment` returns new claims, create popups immediately.
* Cleanup with a `setInterval` that filters out expired instances.

`PopupManager` splits into `sidePopups` and `bottomPopups` and renders:

* **Bottom banner**: SAN‑style lower‑third:

  * Title: `FACT CHECK • LIKELY FALSE` or `FALLACY • STRAWMAN`
  * Body: `claim.reasoning` or claim text.
  * Footer: speaker, timestamp, “See sources” clickable.

* **Side popup** (optional or for high severity): card near right edge, with more explanation.

Use Framer Motion’s `AnimatePresence` for slide‑in/out.

### 8.5 TranscriptDrawer

* Slides from left (`fixed left-0 top-0 h-full w-full md:w-[360px]`).

* Contains:

  * Tab header (just “Transcript” for MVP).
  * Scrollable list of segments:

    ```txt
    [Speaker A] 00:35
    I think we should raise taxes...
    ```

* In replay mode:

  * Clicking a segment calls `onSeek(segment.start)` to jump the video.

### 8.6 FactFeedDrawer

* Slides from right.

* Contains:

  * Tab header (“Fact Feed”).
  * For each `Claim`:

    ```txt
    [ STRAWMAN ] [ LIKELY FALSE ]  Speaker B · 00:37
    “Cuomo wants to abolish all policing.”
    Reasoning: <short explanation>
    Sources:
     • [Title] (link) – snippet…
     • ...
    ```

* This is your detailed “SAN panel.”

---

## 9. Feature Breakdown: Core vs Optional

### Core (must‑have for demo)

* STT → segments (can be basic or precomputed).
* Claude segment → claims & fallacies.
* Fact‑check API integration per claim.
* Live Mode:

  * Webcam video.
  * Basic STT pipeline (or simulated).
  * Popups appearing as new claims arrive.
* Replay Mode:

  * Video player + `demo_clip.json`.
  * Popups synced to `currentTime`.
* UI:

  * Full‑screen video layout.
  * Top HUD.
  * Bottom banner popups.
  * Left transcript drawer.
  * Right fact feed drawer.

### Optional / Stretch

* Argument tracking tab:

  * LLM summarization of unique arguments & whether they were answered.
* Filters and metrics in FactFeed drawer:

  * Filter by fallacy or verdict.
  * Basic stats (e.g. count of fallacies per speaker).
* Additional popup types:

  * Corner toasts for lighter tags (e.g. tone, appeal to emotion).

---

## 10. 6‑Hour Hackathon Roadmap (Team of 4)

**Hour 0–1: Setup & Shell**

* Set up Next.js + Tailwind.
* Build `DebateStage` layout with:

  * VideoLayer placeholder.
  * HUD.
  * Empty PopupManager (rendering fake popup).
  * Empty drawers.
* Set up FastAPI project + basic `/health` route.
* Define TS + Pydantic models for `Segment`, `Claim`.

---

**Hour 1–2: Replay UX (Fake Data)**

* Create a small hardcoded `demo_clip.json` with 2–3 segments and 2–3 claims.
* Implement `/replay`:

  * Video element playing a local clip.
  * Track `currentTime`.
  * PopupManager shows fake popups based on `currentTime`.
  * TranscriptDrawer uses hardcoded segments.
  * FactFeedDrawer uses hardcoded claims.

Goal: **End of hour 2: you can demo the whole UI cycle with fake data.**

---

**Hour 2–3: Claude Integration (Segment → Claims)**

* Implement `/api/analyze-segment` with:

  * Claude call using the prompt above.
  * Mapping response → `ClaimModel` with `verdict = "not_checked"` and `sources = []`.
* Write a small script or temporary page that:

  * Reads a static transcript file.
  * Splits into segments.
  * Calls `/api/analyze-segment` for each segment.
  * Produces a real `demo_clip.json`.

Update `/replay` to load this real file.

---

**Hour 3–4: Fact‑Check API Integration**

* Implement `fact_check_claim_via_api(claim.text)`.
* Wire it into `/api/analyze-segment`:

  * For each claim needing fact check, enrich with `verdict`, `confidence`, `sources`, `reasoning` if available.
* Regenerate `demo_clip.json` with full data.
* Update UI to:

  * Color banners by verdict (green/red/yellow).
  * Show sources list in FactFeed drawer.

---

**Hour 4–5: Live Mode Skeleton**

* Implement `/live`:

  * `getUserMedia` for webcam.
  * Set up simple STT flow (or simulate with text input if STT integration is slow).
* For each “live segment”:

  * Build `Segment`.
  * Append to `segments` state.
  * POST to `/api/analyze-segment` → append returned claims to `claims` state.
* Popups show as soon as claims arrive; drawers show live feeds.

---

**Hour 5–6: Polish & Backup Plan**

* Tune popup timing & severity rules.
* Clean up styles:

  * Better fonts, card spacing, colors.
* Add little touches:

  * Hover states, scroll shadows, smooth drawer animations.
* Rehearse:

  * Live demo (even if STT is mocked).
  * Replay demo as backup.