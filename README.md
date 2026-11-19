# n8n-nodes-max-messenger

[n8n](https://n8n.io) community nodes for the [MAX messenger](https://max.ru) Bot API. Send messages with buttons, files and formatting, manage group chats and channels, and start workflows when your bot receives a message or a button press.

> Unofficial community node. Not affiliated with, endorsed by or sponsored by MAX or VK.

The package contains two nodes:

- **MAX**: messages, chats, bot settings and videos. It can also be used as a tool by the AI Agent node.
- **MAX Trigger**: starts a workflow on bot updates (new message, button press, bot started, bot added to a chat and more). It registers and removes its webhook in MAX automatically.

Russian version: [README.ru.md](README.ru.md)

## Installation

**From the nodes panel (n8n Cloud and self-hosted with verified nodes):** open the nodes panel, search for "MAX" and install the node.

**Self-hosted, manual install:** go to *Settings → Community Nodes → Install*, enter `n8n-nodes-max-messenger` and confirm.

Tested on n8n 2.48 (Node.js 22 or newer).

## Credentials

Create a bot on the [MAX business platform](https://business.max.ru) (*Chat bots → your bot → Settings*) and copy its token. Then create a **MAX Bot API** credential in n8n:

| Field | Value |
| --- | --- |
| Access Token | the bot token |
| API Domain | `platform-api2.max.ru` (default, required by MAX since July 2026) or the legacy `platform-api.max.ru` |
| Ignore SSL Issues | leave off unless you cannot install the certificate described below |

The credential test calls `GET /me`, so a wrong token is reported right away.

### The Russian Trusted Root CA

`platform-api2.max.ru` uses a TLS certificate issued by the Russian Trusted Root CA (Ministry of Digital Development). Most n8n installations do not trust it by default, and the node then reports *"TLS certificate of the MAX API is not trusted"*. Pick one of these:

1. **Trust the CA (recommended).** Download `russian_trusted_root_ca.cer` and `russian_trusted_sub_ca.cer` from [gosuslugi.ru/crt](https://www.gosuslugi.ru/crt), join them into one PEM file and point Node.js at it. For Docker:

   ```bash
   mkdir -p certs
   (cat russian_trusted_root_ca.cer; echo; cat russian_trusted_sub_ca.cer; echo) | tr -d '\r' | sed '/^$/d' > certs/russian-ca.pem
   docker run ... -v "$PWD/certs:/certs:ro" -e NODE_EXTRA_CA_CERTS=/certs/russian-ca.pem docker.n8n.io/n8nio/n8n
   ```

   `NODE_EXTRA_CA_CERTS` adds the CA to the ones Node.js already trusts, so other services keep working. Each certificate must end with its own line break, otherwise Node.js ignores the file.
2. **Use the legacy domain** `platform-api.max.ru`, which still has a globally trusted certificate.
3. **Enable "Ignore SSL Issues"** in the credential. This turns off certificate checks for MAX requests only; use it as a last resort.

## MAX node

| Resource | Operation | What it does |
| --- | --- | --- |
| Message | Send | Send a message to a chat, channel or user: text (plain, Markdown or HTML), attachments, inline keyboard, reply or forward. Text longer than 4000 characters is split into several messages. |
| Message | Edit | Change the text, or replace or remove the attachments and keyboard. |
| Message | Delete | Delete a message. |
| Message | Get | Get a message by ID. |
| Message | Get Many | Messages of a chat, newest first, optionally only older or newer than a date. Return All pages through the whole history. |
| Message | Answer Callback | Answer a button press with a notification and/or an updated message. |
| Chat | Get | Chat, channel or dialog details. |
| Chat | Update | Change the title or description. |
| Chat | Send Action | Show "typing…" or "sending a photo…". |
| Chat | Pin Message / Unpin Message / Get Pinned Message | Manage the pinned message. |
| Chat | Get Members / Get Administrators / Get Bot Membership | List members, administrators or the bot's own permissions. |
| Chat | Remove Member | Remove (and optionally block) a user. |
| Chat | Leave | Make the bot leave the chat. |
| Bot | Get Info | Name, username, description and commands of the bot. |
| Bot | Set Commands | Replace the commands shown in the bot menu. An empty list removes them. |
| Video | Get | Playback URLs, size and duration of a video attachment. |

Pinning, members, administrators and updating a chat work in group chats and channels only; MAX does not offer them for one-to-one dialogs.

### Attachments

Every message can carry up to 12 attachments; the inline keyboard counts as one of them:

- **Binary File**: a file from a binary field of the input item, for example from *HTTP Request* or *Read/Write Files from Disk*. The node uploads it to MAX and picks the type from the MIME type (you can override it): JPG, PNG, GIF, TIFF, BMP and HEIC go as images, MP4, MOV, MKV and WEBM as videos, audio as audio, everything else (WebP, SVG, PDF, archives…) as a file. MAX processes videos for a few seconds after upload; the node waits and retries automatically.
- **Image URL**: a public link to a JPG, PNG, GIF, TIFF, BMP or HEIC picture.
- **Token**: an attachment that is already in MAX, for example `payload.token` of a picture someone sent to the bot. This forwards media without downloading it.
- **Sticker**: a sticker code (`payload.code` of a received sticker).
- **Location**: latitude and longitude.

MAX rules: images and videos can be combined in one message; a file, audio, sticker or location goes alone. A forwarded message cannot carry its own text, attachments or keyboard.

### Inline keyboard

Build the keyboard button by button (row number, type, text) or pass it as JSON. Button types: callback, link, send message, request contact, request location, copy to clipboard and open mini app. MAX allows up to 7 buttons per row (3 if the row has a link, mini app, contact or location button) and 30 rows.

Callback buttons send a `message_callback` update to the **MAX Trigger**. Answer it with **Message → Answer Callback**: the *Callback ID* field is prefilled with `{{ $json.callback.callback_id }}`.

### Using the node as an AI Agent tool

Connect **MAX** to the *Tools* input of an AI Agent and let the model fill fields with `$fromAI()`, for example *Text* = `{{ $fromAI('text', 'Text of the message', 'string') }}`. If the tool version of the node does not show up on an older self-hosted n8n, start n8n with `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`.

## MAX Trigger

Choose the updates the workflow should react to (message received, button pressed, bot started, bot added to chat, message edited and so on) and activate the workflow. The trigger:

- registers its own webhook in MAX with a random secret and checks the `X-Max-Bot-Api-Secret` header of every request (requests without it get HTTP 403);
- needs n8n to answer MAX: if the webhook gets no successful answer for 8 hours (n8n down, certificate expired), MAX removes the subscription. Deactivate and activate the workflow afterwards to register it again;
- removes only its own webhook when the workflow is deactivated, so other integrations of the same bot (CRM, other workflows) keep working;
- re-registers the webhook when you change the list of updates.

MAX delivers updates only to **public HTTPS addresses on port 443** with a certificate from a trusted CA. Self-signed certificates and plain HTTP are not supported, so your n8n must be reachable from the internet (set `WEBHOOK_URL` if it runs behind a proxy). In group chats and channels the bot must be an administrator with the *read all messages* permission to receive messages.

The output is the update object from MAX. Useful fields:

| Update | Fields |
| --- | --- |
| Message received | `message.body.text`, `message.body.attachments`, `message.body.mid`, `message.sender`, `message.recipient.chat_id` |
| Button pressed | `callback.callback_id`, `callback.payload`, `callback.user`, `message` |
| Bot started | `chat_id`, `user`, `payload` (deep link parameter) |
| Bot added to chat | `chat_id`, `is_channel` |

## Example workflow: echo bot with buttons

1. **MAX Trigger**: *Message Received* and *Button Pressed*.
2. **Switch** on `{{ $json.update_type }}`.
3. For `message_created`: **MAX → Message → Send** with *Chat ID* `{{ $json.message.recipient.chat_id }}`, *Text* `You wrote: {{ $json.message.body.text }}`, *Inline Keyboard → Buttons* with two callback buttons "Yes" (`yes`) and "No" (`no`), and *Reply To Message ID* `{{ $json.message.body.mid }}`.
4. For `message_callback`: **MAX → Message → Answer Callback** with *Notification* `You pressed {{ $json.callback.payload }}`.

## Limits worth knowing

- Text: up to 4000 characters per message (longer text is split by the node).
- About 2 messages per second per chat and 30 requests per second per bot; the node retries on HTTP 429.
- Files: MAX accepts images up to 50 MB, video up to 250 MB, audio up to 256 MB and other files up to 4 GB; file names up to 200 characters. The node holds the file in memory while uploading (about twice its size), so the practical limit depends on the memory of your n8n host.
- MAX no longer lists the chats of a bot. Save `chat_id` from *Bot Added to Chat* and *Bot Started* updates if you need it later.

## Resources

- [MAX Bot API documentation](https://dev.max.ru/docs-api)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE.md)
