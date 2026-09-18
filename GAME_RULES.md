# 100 — Game rules

## Goal

Keep the shared total at or below 100. The player who raises it above 100 busts and loses the round. Everyone else survives.

## Round setup

- Shuffle one 52-card deck: Fire, Water, Leaf, and Sun, each with A through K.
- Deal exactly two cards to every player. The other cards form the draw pile.
- Start the shared total at zero, choose a random starting seat, and begin clockwise.
- Suits are visual. They have no gameplay powers.

## A turn

Play one of your two cards. Resolve its value and effect, draw one replacement, then move to the next seat. There is no Pass action. Opponents' hands stay face down. Any mix of 2–8 Human and CPU seats is allowed; multiple Humans share the device.

| Card | Effect |
| --- | --- |
| A | Add 1 |
| 2–6 | Add face value |
| 7 | Add 0. Choose another player, who immediately plays a card without losing their future normal turn. A forced 7 starts another forced play. |
| 8 | Add 0 and reverse direction. With two players, its player takes the next normal turn again. |
| 9 | Add 0. This counts as the mandatory play. |
| 10 | Subtract 10. |
| J, Q, K | Add 10. |

A forced play interrupts the normal turn sequence. When all forced plays resolve, turn order continues from the original player's seat in the current direction. For two-player games, an 8 played during a forced interruption reverses direction but does not override this resume rule.

The 7 player's replacement is drawn when the 7 lands, before target selection, so all hands remain at two cards while a target is chosen. The forced player draws after their play resolves.

## Exactly 100 and bust

Moving the shared total **to exactly 100 from another value** records an Exact 100 event and gives that player +3 local test rating. The round continues. A zero-value card played while the total is already 100 does not record another event. The total can later fall below 100 and reach it again, recording another event.

A total above 100 ends the round immediately. The busting player receives −5 test rating; each survivor receives +1. Values accumulate, so a player who hit 100 earlier can still bust later.

## Draw pile recycling

When the draw pile empties, keep the top played card in place and shuffle earlier played cards into a new draw pile.

## Controls

Drag or flick a card toward the center of the table. A throw needs sufficient distance and a direction toward the table. Invalid throws return to the hand. On touch devices, swipe toward the center. For an accessible alternative, select a card and press **Play Card**. When playing a 7, select a highlighted target.
