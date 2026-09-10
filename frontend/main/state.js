// ==================================================================
// state.js - All shared mutable state for the whole app.
// Must load first in app.html - every other file reads these by bare
// name (NOT window.X - see Team Chat/SplitPlan.md for why).
// ==================================================================

let serverAddress = null;
let ws = null;
let myUsername = null;
let myUserId = null; // from /whoami — needed to compare against a server's owner_id

// The single open chat, whatever kind it is. type is "dm" or "party";
// id's meaning depends on type (a DM partner's user id, or a party's
// party_id) — those two number spaces can coincidentally collide, so
// EVERY comparison against "is this the open chat" must check type AND
// id together, never id alone. name is whatever the header/start-card
// should display (a username or a party name).
let openChatType = null;
let openChatId = null;
let openChatName = null;

let conversationList = [];

// The user's servers, in position order — comes straight from
// GET /get_servers, which already sorts server-side by the stored
// gap-based position column. Unlike conversationList, this array is
// NEVER reordered client-side by activity; it only changes on a fresh
// load or (later) an explicit drag-and-drop reorder.
let serverList = [];

// Which rail icon is currently visually selected — "home" or a server's
// id. Selection is purely cosmetic for now (per this session's scope:
// servers have no functioning view yet), so this only ever drives the
// .active class, nothing else.
let selectedRailIcon = "home";

// The currently-open server and channel, if any. Cleared whenever Home
// is clicked. currentChannelId/Type/Name mirror openChatType/Id/Name's
// role for DMs/parties — the single source of truth for "what's showing
// in the main panel right now" while inside a server.
let currentServerId = null;
let currentServerOwnerId = null;
// The full get_server_contents payload for whichever server is currently
// open — kept around (not just currentServerId/OwnerId) so a live
// category_created/channel_created push can patch it in place and
// re-render, instead of re-fetching the whole server just to add one
// item to the sidebar.
let currentServerData = null;
let currentChannelId = null;
let currentChannelType = null;
let currentChannelName = null;

// Messages currently shown in the open conversation, in send order.
// Kept in memory and fully re-rendered into clusters on every change
// (small lists, ~25 messages) rather than patched in place — this is
// deliberate: a future edit/delete needs to be able to reflow cluster
// boundaries (e.g. deleting the first message in a cluster hands the
// header to the next one), which only works cleanly if render always
// recomputes clusters from the live list rather than trusting old DOM.
let currentMessages = [];

// Per-conversation pagination state — reset whenever openDirectMessage
// switches to a different conversation.
let hasMoreHistory = true;
let isLoadingMore = false;

// Channel messaging mirrors the DM/party pagination state above, kept as
// its own separate set of variables (not folded into currentMessages/
// hasMoreHistory) since a server channel and the DM/party chat window are
// two different main-views that can each be showing their own history at
// once — see view-chat vs. view-channel. Reset whenever selectChannel
// switches to a different channel.
let currentChannelMessages = [];
let channelHasMoreHistory = true;
let channelIsLoadingMore = false;

// Announcements equivalent of the above — same cursor-based pagination
// shape and same oldest-first/newest-at-bottom orientation as chat
// itself. Reset by selectChannel on every channel switch.
let currentAnnouncementPosts = [];
let announcementHasMoreHistory = true;
let announcementIsLoadingMore = false;

// Forum post cards — same cursor-pagination shape as the announcement
// state above, but the list runs the OTHER way: most-recently-active at
// the TOP, paginating downward. Reset by selectChannel on every switch,
// which is also the only thing that re-sorts the list (see below).
let currentForumPosts = [];
let forumHasMore = true;
let forumIsLoadingMore = false;

// Which forum post's thread is open, or null when the chat UI is showing
// an ordinary text channel. A thread is just a chat, so it BORROWS the
// channel chat view outright — #channel-body, #channel-messages,
// #channel-composer, currentChannelMessages and the pagination flags
// above are all reused rather than duplicated. This is the flag that
// tells the three shared paths (renderChannelMessages, sendChannelMessage,
// loadOlderChannelMessages) which of the two they're currently driving.
// Only one can be on screen at a time, so sharing the array is safe —
// but selectChannel MUST clear this on every channel switch, or a send
// from the next text channel would still be addressed to the old thread.
let openForumPostId = null;
let openForumPostTitle = null;

// forumCardElements[postId] = { tagsEl, countEl, activityEl }
// Same idea as commentThreadElements: registered once per card so a live
// broadcast can retext the right card without searching the DOM. Kept
// deliberately narrow — a live update may only change a card's CONTENTS,
// never its position, since reordering the list under someone who's
// mid-read is the exact thing the Forums design forbids.
const forumCardElements = {};

// Comment threads — one entry per post, NOT reset on channel switch
// like the post-pagination state above, since a post card (and its
// thread) only exists in the DOM while its channel is open anyway;
// stale entries for posts no longer on screen are harmless dead
// weight, not a correctness risk.
// commentThreadState[postId] = { expanded, comments: [], hasMore }
const commentThreadState = {};
// commentThreadElements[postId] = { btnEl, listEl, loadMoreBtn, sectionEl }
// — populated once per card in buildAnnouncementPostCard, so a live
// announcement_comment broadcast can find and update the right card
// without needing to search the DOM.
const commentThreadElements = {};

// A same-sender gap this long or longer forces a new cluster/bubble,
// even without a sender change in between.
const CLUSTER_GAP_MINUTES = 5;

// Matches an invite link's exact shape (this app's own domain + path,
// specifically — not a loose "any link" guess) so a pasted invite gets
// unfurled into a real card, the same way a normal chat client unfurls
// a pasted link, without accidentally matching some unrelated URL a
// person happens to paste that just looks similar.
const INVITE_LINK_REGEX = /^https:\/\/oneira\.cc\/invite\/([A-Za-z0-9]{8})$/;
