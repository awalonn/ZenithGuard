# ZenithGuard - Next Session Tasks

**Last Updated: 2025-12-21 (v2.1.0 Released)**

## ✅ COMPLETED: v2.1.0 Release Overview
This session was a major success. We stabilized the codebase and released version 2.1.0.

### Key Achievements
1.  **Architecture Clarity**: Hybrid system (Static + Cosmetic) is now clearly explained in UI and Code.
2.  **UI Overhaul**: Split dashboard into "Network Blocking" and "Cosmetic Filters". added real-time stats.
3.  **Heuristic Engine Upgrade**: Added 10+ "Pro" keywords (telemetry, fingerprinting) and optimized regex generation to fix memory errors.
4.  **YouTube Fix**: Fixed `yt_interceptor.js` path, restoring auto-skip functionality.
5.  **Manual Controls**: Added "Add Site" to Network Blocklist.

---

## 🚀 Potential Goals for Next Session

### Option A: The "AI" Path (Gemini Integration)
*   **Current State**: AI features are largely disabled or throttled to save quota.
*   **Goal**: Re-integrate Gemini 3 Flash for intelligent, low-cost analysis of unblocked ads.
*   **Tasks**:
    *   Review `ai_handler.ts` state.
    *   Implement smarter caching to reduce API calls.
    *   Add "Analyze Page" button for users to manually trigger AI audit.

### Option B: The "Expansion" Path (Firefox Support)
*   **Current State**: Chrome-only (Manifest V3).
*   **Goal**: Port extension to Firefox.
*   **Tasks**:
    *   Create `manifest.firefox.json`.
    *   Test specific API differences (Firefox has better blocking APIs than Chrome).
    *   Set up cross-browser build script.

### Option C: The "Hardening" Path (Anti-Circumvention)
*   **Current State**: Good basic blocking, but smart sites can detect us.
*   **Goal**: Improve anti-detection and script blocking.
*   **Tasks**:
    *   Implement "Scriptlets" (uBlock Origin style) for advanced defusing.
    *   Harden `yt_interceptor` against new YouTube detection methods.
    *   Add "Strict Mode" for aggressive script blocking.

---

## 📋 Session Checklist for Next Time
- [ ] Review user feedback on v2.1.0 (if any).
- [ ] Select one major path (AI, Expansion, or Hardening).
- [ ] Clean up `src/js/content/modules` (some tech debt remains).

