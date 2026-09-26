# Estimated remaining reading time

*The engineering half is [ADR 0010](../adr/0010-estimated-remaining-reading-time.md).*

The player shows how much listening time remains, so the listener can
decide whether there is time to finish. A setting, enabled by default,
controls the display in all three player layouts.

## What the time means

Ordinary reading shows the estimated time from the current place to the
end of the document. When a reliable table of contents is available, it
also shows the time to the end of the current reading section: the
top-level entry, including its later subsections. The display uses that
entry's actual name. If the outermost entries are parts containing several
chapters, the time covers the part; there is no choice of depth. Without
reliable boundaries, only the document estimate is shown.

Selecting text currently chooses where reading starts; reading continues
to the end of the document, so document and section estimates still apply.
If reading is limited to selected content, its estimate is labeled as
selected content and covers only that range. This decision does not add a
new way to start selection-only reading.

The estimates use the current speed and include the configured pauses
between sentences and paragraphs. They exclude manual pauses and network
waits, during which reading does not consume the estimated time. Neither
the full document's total duration nor a predicted clock time of completion
is shown.

The display uses minutes, with “less than 1 minute” for a positive
remainder below one minute. It stays visible in the Top bar, Bottom bar
and Floating panel without requiring expansion.

## Display boundaries

While the text is loading, show “Estimating.” If no estimate can be made,
show that it is unavailable rather than a number. At the end of the reading
range, show “Finished”; resetting the reading place must not make the
finished time jump back up. Turning the setting off hides all estimates.

## Useful early, corrected as reading continues

The first estimate appears as soon as the reading text is available.
Actual audio from ordinary reading refines it as it arrives. The estimate
can rise or fall as the voice's pace becomes clearer; changing the voice,
speed or reading place recalculates it.

This gives an early answer at the cost of initial uncertainty. Waiting
until enough audio is available would give a better first number, but
would withhold the information when the listener first decides whether to
continue. Showing seconds would suggest more precision than the estimate
has, so the display stays at minutes and is explicitly an estimate.

Generating the whole document's audio just to measure its length would
take longer and could charge for text the listener never hears. The
estimate does not cause extra speech generation.
