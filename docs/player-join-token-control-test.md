# Player Join And Token Control Test

This document describes how to test the AMBA Owlbear extension from both the GM view and a player view.

The immediate goal is to verify that a player can join the Owlbear room from an incognito/private browser window and take control of one assigned token, or choose a token if the room permissions allow it.

## Current Owlbear Model

Owlbear Rodeo rooms are joined by link.

The GM creates or opens a room, then sends the room link to players. A player opening the link lands in a waiting/request screen. The GM admits the player into the room.

Owlbear supports anonymous players, so a player does not need an account just to join and move around the room. A player account is mainly needed for saved data such as uploading personal images.

Token control is controlled by room permissions. The important character permission is:

```text
CHARACTER_OWNER_ONLY
```

When Owner Only is enabled for characters:

- Players can interact with characters they own.
- Players cannot interact with other players' characters.
- The GM can still move/control all character tokens.
- A character is normally owned by the player who created it.
- The GM can assign an owner through Owlbear's Owner menu when Owner Only is enabled.

Reviewed sources:

- Owlbear Rooms: https://docs.owlbear.rodeo/docs/rooms/
- Owlbear Permissions: https://docs.owlbear.rodeo/docs/permissions/
- Owlbear Permission reference: https://docs.owlbear.rodeo/extensions/reference/permission/
- Owlbear Player reference: https://docs.owlbear.rodeo/extensions/reference/player/

## Test Roles

Use two browser contexts:

1. GM view
   - Normal browser window.
   - Logged into your Owlbear account.
   - Owns the room.
   - Has the AMBA extension loaded.

2. Player view
   - Incognito/private browser window.
   - Anonymous player is acceptable.
   - Joins through the room invite link.

The GM view is the authoritative view. It should be used to:

- Admit the player.
- Import AMBA map and tokens.
- Set player permissions.
- Assign token ownership.
- Confirm what the player should and should not be able to move.

## Pre-Test Setup

1. Confirm the AMBA extension is loaded in Owlbear.
2. Confirm AMBA API is running.
3. Open an Owlbear room as GM.
4. Open or create a scene.
5. Import a queued AMBA encounter or manually import an encounter.
6. Confirm the scene has:
   - a map, if the encounter has one,
   - monster-block tokens,
   - PC tokens if testing PC ownership.

## Player Join Test

1. In the GM browser, copy the Owlbear room invite link.
2. Open an incognito/private browser window.
3. Paste the room invite link.
4. Choose a player display name, for example:

   ```text
   Test Player
   ```

5. Request to join the room.
6. In the GM browser, admit the player.
7. Confirm the player can see the room and current scene.

Expected result:

- Player enters the same room.
- Player sees the active scene.
- Player is not a GM.
- Player does not see GM-only controls.

## Permission Setup For Token Control

In the GM view:

1. Open Player Permissions.
2. Confirm players have character update permission if they should move character tokens.
3. Decide whether to enable Owner Only.

Recommended controlled test:

```text
Enable CHARACTER_UPDATE
Enable CHARACTER_OWNER_ONLY
```

This verifies that a player can move their assigned token but not everyone else's tokens.

## Assign A Token To The Incognito Player

In the GM view:

1. Select or right-click the token the player should control.
2. Use Owlbear's Owner menu.
3. Assign the token to `Test Player`.

The Owner menu is expected to appear only when Owner Only character permissions are enabled.

Recommended first token:

- Use one PC token if the test is about player characters.
- Use one monster token if the test is purely about ownership mechanics.

## Player Token Control Test

In the incognito player view:

1. Try to select the assigned token.
2. Drag the assigned token a short distance.
3. Confirm it moves.
4. Try to select a token owned by the GM or another player.
5. Try to drag that unassigned token.

Expected result with Owner Only enabled:

- Assigned token can be selected and moved.
- Unassigned tokens cannot be moved by the player.
- GM can still move all tokens.

Expected result with Owner Only disabled:

- Player behavior depends on broader character update permissions.
- If players have character update permission, they may be able to move any character token.
- This is useful for open-table/simple tests but not ideal for strict per-player control.

## "Player Picks A Token" Variant

If we want players to pick their own token instead of the GM assigning it manually, there are two practical approaches.

### Option A: Player Creates Or Adds Their Own Token

If the player adds a token to the scene, Owlbear normally treats that player as the owner.

Pros:

- Uses Owlbear's native ownership model.
- No custom AMBA ownership UI needed.

Cons:

- Not ideal for AMBA-generated PC tokens unless the player can access/import the right token.
- Gives players more creation permissions than the GM may want.

### Option B: AMBA Extension "Claim Token" Flow

Future extension behavior could allow a player to claim an unowned AMBA PC token.

Possible flow:

1. GM imports PC tokens.
2. Player opens the AMBA extension panel.
3. Player clicks `Claim` next to their PC.
4. Extension assigns the current Owlbear player as the token owner.

Open question:

- We need to confirm whether the Owlbear SDK exposes owner assignment for scene items directly, or whether ownership assignment is only available through Owlbear's native UI. If SDK owner assignment is not exposed, the GM must use Owlbear's Owner menu.

## AMBA Encounter Import Test With Player Present

This test checks that queue imports do not disturb an admitted player.

1. Keep the incognito player in the room.
2. In AMBA, right-click an encounter.
3. Choose `Export to Owlbear`.
4. In the GM Owlbear view, click `Import queued exports`.
5. Confirm the map appears in a non-overlapping position.
6. Confirm monster tokens appear staged below the occupied area.
7. Confirm the player sees the new map/tokens appear.
8. Assign one token to the player.
9. Confirm the player can move only the assigned token.

## Things To Watch

### Ownership Of Extension-Created Tokens

Tokens created by the AMBA extension are created by the user running the extension. In the normal workflow, that is the GM.

This means imported PC and monster tokens will likely start as GM-owned until ownership is assigned.

### GM View Vs Player View

The GM view is the normal logged-in Owlbear window.

The player view should be incognito/private so it acts like a separate user/connection. This avoids accidentally testing the same authenticated Owlbear identity twice.

### Anonymous Player Identity

Owlbear's Player reference distinguishes `id` and `connectionId`.

- `id` is the user ID and may be shared if the same player joins multiple times.
- `connectionId` is unique per connection.

For manual testing, use the visible player name in Owlbear's UI. For future extension automation, be careful about using the right identifier.

## Pass Criteria

The test passes when:

- Incognito player can request access.
- GM can admit the player.
- Player sees the same active scene.
- AMBA encounter import works while the player is connected.
- GM can assign a token to the player.
- Player can move the assigned token.
- Player cannot move unassigned tokens when Owner Only is enabled.
- GM can still move all tokens.

## Follow-Up Implementation Notes

Potential future AMBA/Owlbear extension features:

1. Add a player-facing PC claim panel.
2. Store AMBA `pcId` on imported PC token metadata.
3. Store Owlbear player ownership state once an API path is confirmed.
4. Add a GM-only "Assign PCs" panel showing connected players from `OBR.party.getPlayers()`.
5. Add a test-only debug panel listing current Owlbear players, roles, and selected token metadata.
6. Add documentation screenshots once the test flow is confirmed.
