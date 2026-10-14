---
"@maple-kit/core": patch
"@maple-kit/ui": patch
---

Tapping Cmd (or Ctrl) to start a comment is more reliable. Momentum scrolling no longer cancels a tap, only Cmd+scroll does. A focused checkbox, radio, button or other non-text input no longer blocks it. A missed key release heals on the next press, and a hidden tab resets the tap. A tap swallowed by a text field now shows a short hint beside the island, and a tap with the composer open focuses its field.
