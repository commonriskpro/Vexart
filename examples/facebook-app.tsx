/**
 * Vexart Facebook Dark Mode Clone — Pixel-Native GPU-Accelerated Terminal UI.
 *
 * Full-featured interactive Facebook clone using exclusively the official @vexart/styled
 * component system and @vexart/app primitives.
 *
 * Run: bun --conditions=browser run examples/facebook-app.tsx
 */

import { createSignal, For, Show } from "solid-js"
import { useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal } from "@vexart/app"
import {
  VoidCard,
  VoidCardHeader,
  VoidCardTitle,
  VoidCardDescription,
  VoidCardContent,
  VoidCardFooter,
  VoidButton,
  VoidBadge,
  VoidAvatar,
  VoidSeparator,
  VoidInput,
  colors,
  radius,
  space,
  font,
  weight,
  shadows,
} from "@vexart/styled"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Comment {
  id: string
  author: string
  avatarColor: string
  text: string
  time: string
}

interface Story {
  id: string
  author: string
  avatarColor: string
}

interface Contact {
  id: string
  name: string
  subtitle: string
  avatarColor: string
}

interface ChatMessage {
  id: string
  sender: "me" | "them"
  text: string
  time: string
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

const STORIES: Story[] = [
  { id: "s1", author: "Fran Momo", avatarColor: "#e11d48" },
  { id: "s2", author: "Astrid Morales", avatarColor: "#8b5cf6" },
  { id: "s3", author: "Sayani SVal", avatarColor: "#06b6d4" },
  { id: "s4", author: "Laura Carrillo", avatarColor: "#f59e0b" },
]

const CONTACTS: Contact[] = [
  { id: "c1", name: "Alex Rivera", subtitle: "Active now", avatarColor: "#3b82f6" },
  { id: "c2", name: "Elena Rostova", subtitle: "5m ago", avatarColor: "#14b8a6" },
  { id: "c3", name: "Kevin Vance", subtitle: "Active now", avatarColor: "#f59e0b" },
]

const INITIAL_VESPER_COMMENTS: Comment[] = [
  {
    id: "cm1",
    author: "Carl Johnson (CJ)",
    avatarColor: "#22c55e",
    text: "Ah shit, here we go again. Looking fresh in Vice City!",
    time: "3h",
  },
  {
    id: "cm2",
    author: "Tommy Vercetti",
    avatarColor: "#06b6d4",
    text: "This is our town now. Retro sunset vibe is unmatched!",
    time: "2h",
  },
]

const INITIAL_MESSAGES: ChatMessage[] = [
  { id: "m1", sender: "them", text: "Hi, is this available?", time: "8:45 AM" },
  { id: "m2", sender: "me", text: "Yes, are you interested?", time: "8:46 AM" },
]

// ── Main App Component ────────────────────────────────────────────────────────

function FacebookApp() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  // Navigation & Search State
  const [navTab, setNavTab] = createSignal<number>(0)
  const [searchQuery, setSearchQuery] = createSignal<string>("")

  // Feed State
  const [newPostText, setNewPostText] = createSignal<string>("")
  const [isLikedVesper, setIsLikedVesper] = createSignal<boolean>(false)
  const [vesperLikes, setVesperLikes] = createSignal<number>(1400)
  const [vesperShares, setVesperShares] = createSignal<number>(38)
  const [showVesperComments, setShowVesperComments] = createSignal<boolean>(true)
  const [vesperComments, setVesperComments] = createSignal<Comment[]>(INITIAL_VESPER_COMMENTS)
  const [newCommentInput, setNewCommentInput] = createSignal<string>("")

  // Right Column State
  const [friendRequestConfirmed, setFriendRequestConfirmed] = createSignal<boolean>(false)
  const [friendRequestDeleted, setFriendRequestDeleted] = createSignal<boolean>(false)
  const [chatMessages, setChatMessages] = createSignal<ChatMessage[]>(INITIAL_MESSAGES)
  const [chatInput, setChatInput] = createSignal<string>("")

  // Handlers
  function handleCreatePost() {
    const text = newPostText().trim()
    if (!text) return
    setNewPostText("")
  }

  function handleToggleLikeVesper() {
    if (isLikedVesper()) {
      setIsLikedVesper(false)
      setVesperLikes((prev) => Math.max(0, prev - 1))
    } else {
      setIsLikedVesper(true)
      setVesperLikes((prev) => prev + 1)
    }
  }

  function handleAddVesperComment() {
    const text = newCommentInput().trim()
    if (!text) return

    const comment: Comment = {
      id: `cm-${Date.now()}`,
      author: "Carlos Gonzalez",
      avatarColor: "#1877f2",
      text,
      time: "Just now",
    }

    setVesperComments([...vesperComments(), comment])
    setNewCommentInput("")
    setShowVesperComments(true)
  }

  function handleShareVesper() {
    setVesperShares((prev) => prev + 1)
  }

  function handleSendChatMessage() {
    const text = chatInput().trim()
    if (!text) return

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "me",
      text,
      time: "Just now",
    }

    setChatMessages([...chatMessages(), userMsg])
    setChatInput("")

    setTimeout(() => {
      const replyMsg: ChatMessage = {
        id: `msg-reply-${Date.now()}`,
        sender: "them",
        text: "Sounds good! Can I see the Jeep tomorrow?",
        time: "Just now",
      }
      setChatMessages((prev) => [...prev, replyMsg])
    }, 800)
  }

  const navTabs = ["Home", "Watch", "Marketplace", "Groups", "Gaming"]

  return (
    <box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      direction="column"
    >
      {/* ──────────────────────────────────────────────────────────────────────────
          1. TOP NAVIGATION HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <box
        width={dims.width()}
        height={52}
        backgroundColor={colors.card}
        direction="row"
        alignY="center"
        paddingX={space[3]}
        borderColor={colors.border}
        borderBottom={1}
        justifyContent="space-between"
      >
        {/* Left: Brand Logo & Search */}
        <box direction="row" alignY="center" gap={space[3]}>
          <box direction="row" alignY="center" gap={space[2]}>
            <box
              width={34}
              height={34}
              cornerRadius={radius.full}
              backgroundColor="#1877f2"
              alignX="center"
              alignY="center"
            >
              <text color="#ffffff" fontSize={font.xl} fontWeight={weight.bold}>
                f
              </text>
            </box>
            <text color={colors.foreground} fontSize={font.lg} fontWeight={weight.bold}>
              Facebook
            </text>
          </box>

          <VoidInput
            value={searchQuery()}
            onChange={setSearchQuery}
            placeholder="Search Facebook..."
            width={220}
          />
        </box>

        {/* Center: Navigation Tabs */}
        <box direction="row" alignX="center" alignY="center" gap={space[1]}>
          <For each={navTabs}>
            {(tabLabel, index) => {
              const isActive = () => navTab() === index()
              return (
                <VoidButton
                  variant={isActive() ? "default" : "ghost"}
                  size="sm"
                  onPress={() => setNavTab(index())}
                >
                  {tabLabel}
                </VoidButton>
              )
            }}
          </For>
        </box>

        {/* Right: Actions & User Avatar */}
        <box direction="row" alignY="center" gap={space[2]} justifyContent="flex-end">
          <VoidButton variant="secondary" size="sm">
            <box direction="row" alignY="center" gap={space[1.5]}>
              <text color={colors.foreground} fontSize={font.sm}>
                Chat
              </text>
              <VoidBadge variant="destructive">1</VoidBadge>
            </box>
          </VoidButton>

          <VoidButton variant="secondary" size="sm">
            <box direction="row" alignY="center" gap={space[1.5]}>
              <text color={colors.foreground} fontSize={font.sm}>
                Bell
              </text>
              <VoidBadge variant="destructive">15</VoidBadge>
            </box>
          </VoidButton>

          <VoidAvatar name="Carlos Gonzalez" size="sm" color="#1877f2" />
        </box>
      </box>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. 3-COLUMN MAIN BODY LAYOUT
          ────────────────────────────────────────────────────────────────────────── */}
      <box
        direction="row"
        width="100%"
        height="grow"
        gap={space[3]}
        padding={space[3]}
      >
        {/* ── LEFT COLUMN (Profile & Shortcuts) ─────────────────────────── */}
        <box width={260} direction="column" gap={space[3]}>
          <VoidCard size="sm">
            <VoidCardHeader>
              <box direction="row" alignY="center" gap={space[2.5]}>
                <VoidAvatar name="Carlos Gonzalez" size="default" color="#1877f2" />
                <box direction="column" gap={space[0.5]}>
                  <VoidCardTitle>Carlos Gonzalez</VoidCardTitle>
                  <VoidCardDescription>View profile</VoidCardDescription>
                </box>
              </box>
            </VoidCardHeader>

            <VoidCardContent>
              <box direction="column" gap={space[1]}>
                <VoidButton variant="ghost" size="sm" onPress={() => {}}>
                  Meta AI
                </VoidButton>
                <VoidButton variant="ghost" size="sm" onPress={() => {}}>
                  Friends
                </VoidButton>
                <VoidButton variant="ghost" size="sm" onPress={() => {}}>
                  Memories
                </VoidButton>
                <VoidButton variant="ghost" size="sm" onPress={() => {}}>
                  Saved
                </VoidButton>
                <VoidButton variant="ghost" size="sm" onPress={() => {}}>
                  Groups
                </VoidButton>
              </box>
            </VoidCardContent>

            <VoidSeparator />

            <VoidCardHeader>
              <VoidCardTitle>Your shortcuts</VoidCardTitle>
            </VoidCardHeader>

            <VoidCardContent>
              <box direction="column" gap={space[1]}>
                <VoidButton variant="ghost" size="sm" onPress={() => {}}>
                  Buy Salvage Autos
                </VoidButton>
                <VoidButton variant="ghost" size="sm" onPress={() => {}}>
                  Dealer OS
                </VoidButton>
                <VoidButton variant="ghost" size="sm" onPress={() => {}}>
                  Deluxe Cars Miami
                </VoidButton>
                <VoidButton variant="ghost" size="sm" onPress={() => {}}>
                  Only Luxury Rentals
                </VoidButton>
              </box>
            </VoidCardContent>

            <VoidCardFooter>
              <text color={colors.mutedForeground} fontSize={font.xs}>
                Meta © 2026 · Vexart Engine
              </text>
            </VoidCardFooter>
          </VoidCard>
        </box>

        {/* ── CENTER COLUMN (Create Post, Stories & Vesper Sienna Post) ──── */}
        <box width="grow" direction="column" gap={space[3]}>
          {/* 1. Create Post */}
          <VoidCard size="sm">
            <VoidCardContent>
              <box direction="column" gap={space[3]}>
                <box direction="row" alignY="center" gap={space[2.5]}>
                  <VoidAvatar name="Carlos Gonzalez" size="default" color="#1877f2" />
                  <box width="grow">
                    <VoidInput
                      value={newPostText()}
                      onChange={setNewPostText}
                      onSubmit={handleCreatePost}
                      placeholder="What's on your mind, Carlos?"
                      width="grow"
                    />
                  </box>
                </box>

                <VoidSeparator />

                <box direction="row" justifyContent="space-between" alignY="center">
                  <box direction="row" gap={space[1.5]}>
                    <VoidButton variant="ghost" size="xs">
                      Live video
                    </VoidButton>
                    <VoidButton variant="ghost" size="xs">
                      Photo/video
                    </VoidButton>
                    <VoidButton variant="ghost" size="xs">
                      Feeling/activity
                    </VoidButton>
                  </box>

                  <VoidButton variant="default" size="xs" onPress={handleCreatePost}>
                    Post
                  </VoidButton>
                </box>
              </box>
            </VoidCardContent>
          </VoidCard>

          {/* 2. Stories Carousel */}
          <VoidCard size="sm">
            <VoidCardHeader>
              <box direction="row" justifyContent="space-between" alignY="center">
                <VoidCardTitle>Stories</VoidCardTitle>
                <VoidBadge variant="outline">See all</VoidBadge>
              </box>
            </VoidCardHeader>

            <VoidCardContent>
              <box direction="row" gap={space[2]} width="100%">
                <box
                  width={100}
                  height={130}
                  backgroundColor={colors.secondary}
                  cornerRadius={radius.lg}
                  padding={space[2]}
                  direction="column"
                  justifyContent="space-between"
                  alignX="center"
                  borderWidth={1}
                  borderColor={colors.border}
                >
                  <box
                    width={36}
                    height={36}
                    cornerRadius={radius.full}
                    backgroundColor="#1877f2"
                    alignX="center"
                    alignY="center"
                  >
                    <text color="#ffffff" fontSize={font.xl} fontWeight={weight.bold}>
                      +
                    </text>
                  </box>
                  <text color={colors.foreground} fontSize={font.xs} fontWeight={weight.semibold}>
                    Create story
                  </text>
                </box>

                <For each={STORIES}>
                  {(story) => (
                    <box
                      width={100}
                      height={130}
                      backgroundColor={colors.secondary}
                      cornerRadius={radius.lg}
                      padding={space[2]}
                      direction="column"
                      justifyContent="space-between"
                      borderWidth={1}
                      borderColor={colors.border}
                    >
                      <VoidAvatar name={story.author} size="sm" color={story.avatarColor} />
                      <box direction="column" gap={space[0.5]}>
                        <VoidBadge variant="secondary">Story</VoidBadge>
                        <text
                          color={colors.foreground}
                          fontSize={font.xs}
                          fontWeight={weight.semibold}
                        >
                          {story.author}
                        </text>
                      </box>
                    </box>
                  )}
                </For>
              </box>
            </VoidCardContent>
          </VoidCard>

          {/* 3. Vesper Sienna Post */}
          <VoidCard size="sm">
            <VoidCardHeader>
              <box direction="row" justifyContent="space-between" alignY="center">
                <box direction="row" gap={space[2.5]} alignY="center">
                  <VoidAvatar name="Vesper Sienna" size="default" color="#9333ea" />
                  <box direction="column" gap={space[0.5]}>
                    <VoidCardTitle>Vesper Sienna</VoidCardTitle>
                    <VoidCardDescription>4h · GTA San Andreas Theme</VoidCardDescription>
                  </box>
                </box>
                <VoidBadge variant="outline">Online</VoidBadge>
              </box>
            </VoidCardHeader>

            <VoidCardContent>
              <box direction="column" gap={space[3]}>
                <text color={colors.foreground} fontSize={font.base}>
                  Soy un personaje online facha
                </text>

                {/* Vice City Neon Banner */}
                <box
                  height={110}
                  backgroundColor="#140727"
                  borderColor="#ec4899"
                  borderWidth={1}
                  cornerRadius={radius.md}
                  padding={space[3]}
                  direction="column"
                  justifyContent="space-between"
                  shadow={shadows.sm}
                >
                  <box direction="row" justifyContent="space-between" alignY="center">
                    <text color="#06b6d4" fontSize={font.xs} fontWeight={weight.bold}>
                      ✦ SUNSET STRIP - 80s NEON ✦
                    </text>
                    <text color="#ec4899" fontSize={font.xs} fontWeight={weight.bold}>
                      VICE CITY, FL
                    </text>
                  </box>

                  <box direction="column" alignX="center" alignY="center" gap={space[0.5]}>
                    <text color="#ec4899" fontSize={font.xl} fontWeight={weight.bold}>
                      VICE CITY MOTEL
                    </text>
                    <text color="#f472b6" fontSize={font.xs} fontWeight={weight.medium}>
                      VACANCY · OCEAN DRIVE · 1986
                    </text>
                  </box>

                  <box direction="row" justifyContent="space-between" alignY="center">
                    <text color="#a855f7" fontSize={font.xs}>
                      PALM BEACH AVE
                    </text>
                    <text color="#06b6d4" fontSize={font.xs} fontWeight={weight.bold}>
                      GRAND THEFT AUTO THEME
                    </text>
                  </box>
                </box>

                {/* Post Stats */}
                <box direction="row" justifyContent="space-between" alignY="center">
                  <text color={colors.mutedForeground} fontSize={font.sm}>
                    {vesperLikes()} likes
                  </text>
                  <text color={colors.mutedForeground} fontSize={font.sm}>
                    {vesperComments().length + 140} comments · {vesperShares()} shares
                  </text>
                </box>

                <VoidSeparator />

                {/* Post Action Buttons */}
                <box direction="row" gap={space[2]} justifyContent="space-between">
                  <VoidButton
                    variant={isLikedVesper() ? "default" : "secondary"}
                    size="sm"
                    onPress={handleToggleLikeVesper}
                  >
                    {isLikedVesper() ? "✓ Liked" : "Like"}
                  </VoidButton>

                  <VoidButton
                    variant="secondary"
                    size="sm"
                    onPress={() => setShowVesperComments(!showVesperComments())}
                  >
                    {showVesperComments() ? "Hide Comments" : "Comment"}
                  </VoidButton>

                  <VoidButton variant="secondary" size="sm" onPress={handleShareVesper}>
                    Share
                  </VoidButton>
                </box>

                {/* Collapsible Comments Section */}
                <Show when={showVesperComments()}>
                  <VoidSeparator />

                  <box direction="column" gap={space[2.5]}>
                    <For each={vesperComments()}>
                      {(comment) => (
                        <box direction="row" gap={space[2]} alignY="top">
                          <VoidAvatar name={comment.author} size="sm" color={comment.avatarColor} />
                          <box
                            backgroundColor={colors.secondary}
                            padding={space[2]}
                            cornerRadius={radius.md}
                            direction="column"
                            gap={space[0.5]}
                            width="grow"
                          >
                            <box direction="row" gap={space[1.5]} alignY="center">
                              <text
                                color={colors.foreground}
                                fontSize={font.xs}
                                fontWeight={weight.bold}
                              >
                                {comment.author}
                              </text>
                              <text color={colors.mutedForeground} fontSize={font.xs}>
                                · {comment.time}
                              </text>
                            </box>
                            <text color={colors.foreground} fontSize={font.sm}>
                              {comment.text}
                            </text>
                          </box>
                        </box>
                      )}
                    </For>

                    {/* Add Comment Input */}
                    <box direction="row" gap={space[2]} alignY="center" marginTop={space[1]}>
                      <VoidAvatar name="Carlos Gonzalez" size="sm" color="#1877f2" />
                      <box width="grow">
                        <VoidInput
                          value={newCommentInput()}
                          onChange={setNewCommentInput}
                          onSubmit={handleAddVesperComment}
                          placeholder="Write a comment..."
                          width="grow"
                        />
                      </box>
                      <VoidButton variant="default" size="sm" onPress={handleAddVesperComment}>
                        Send
                      </VoidButton>
                    </box>
                  </box>
                </Show>
              </box>
            </VoidCardContent>
          </VoidCard>
        </box>

        {/* ── RIGHT COLUMN (Friend Requests, Messenger & Contacts) ──────── */}
        <box width={300} direction="column" gap={space[3]}>
          {/* 1. Friend Requests */}
          <VoidCard size="sm">
            <VoidCardHeader>
              <box direction="row" justifyContent="space-between" alignY="center">
                <VoidCardTitle>Friend requests</VoidCardTitle>
                <VoidBadge variant="secondary">1</VoidBadge>
              </box>
            </VoidCardHeader>

            <VoidCardContent>
              <Show
                when={!friendRequestConfirmed() && !friendRequestDeleted()}
                fallback={
                  <Show
                    when={friendRequestConfirmed()}
                    fallback={
                      <text color={colors.mutedForeground} fontSize={font.sm}>
                        Request removed
                      </text>
                    }
                  >
                    <VoidBadge variant="outline">✓ Request confirmed</VoidBadge>
                  </Show>
                }
              >
                <box direction="column" gap={space[3]}>
                  <box direction="row" gap={space[2.5]} alignY="center">
                    <VoidAvatar name="Paul Fran" size="default" color="#6366f1" />
                    <box direction="column" gap={space[0.5]}>
                      <text
                        color={colors.foreground}
                        fontSize={font.sm}
                        fontWeight={weight.semibold}
                      >
                        Paul Fran
                      </text>
                      <text color={colors.mutedForeground} fontSize={font.xs}>
                        1d · 4 mutual friends
                      </text>
                    </box>
                  </box>

                  <box direction="row" gap={space[2]}>
                    <VoidButton
                      variant="default"
                      size="sm"
                      onPress={() => setFriendRequestConfirmed(true)}
                    >
                      Confirm
                    </VoidButton>
                    <VoidButton
                      variant="secondary"
                      size="sm"
                      onPress={() => setFriendRequestDeleted(true)}
                    >
                      Delete
                    </VoidButton>
                  </box>
                </box>
              </Show>
            </VoidCardContent>
          </VoidCard>

          {/* 2. Marketplace & Messenger Chat */}
          <VoidCard size="sm">
            <VoidCardHeader>
              <box direction="row" justifyContent="space-between" alignY="center">
                <box direction="row" gap={space[2]} alignY="center">
                  <VoidAvatar name="Daniel" size="sm" color="#10b981" />
                  <VoidCardTitle>Daniel · 2019 Jeep</VoidCardTitle>
                </box>
                <VoidBadge variant="outline">$10,980</VoidBadge>
              </box>
              <VoidCardDescription>Marketplace · 2019 Jeep Wrangler</VoidCardDescription>
            </VoidCardHeader>

            <VoidCardContent>
              <box direction="column" gap={space[2]}>
                {/* Chat History */}
                <box direction="column" gap={space[1.5]} paddingY={space[1]}>
                  <For each={chatMessages()}>
                    {(msg) => {
                      const isMe = msg.sender === "me"
                      return (
                        <box alignX={isMe ? "right" : "left"} direction="column" gap={space[0.5]}>
                          <box
                            backgroundColor={isMe ? "#0084ff" : colors.secondary}
                            paddingX={space[2.5]}
                            paddingY={space[1.5]}
                            cornerRadius={radius.md}
                          >
                            <text color="#ffffff" fontSize={font.xs}>
                              {msg.text}
                            </text>
                          </box>
                          <text
                            color={colors.mutedForeground}
                            fontSize={font.xs}
                            alignX={isMe ? "right" : "left"}
                          >
                            {isMe ? `${msg.time} · Seen` : msg.time}
                          </text>
                        </box>
                      )
                    }}
                  </For>
                </box>

                {/* Chat Input */}
                <box direction="row" gap={space[1.5]} alignY="center">
                  <box width="grow">
                    <VoidInput
                      value={chatInput()}
                      onChange={setChatInput}
                      onSubmit={handleSendChatMessage}
                      placeholder="Aa..."
                      width="grow"
                    />
                  </box>
                  <VoidButton variant="default" size="sm" onPress={handleSendChatMessage}>
                    Send
                  </VoidButton>
                </box>
              </box>
            </VoidCardContent>
          </VoidCard>

          {/* 3. Online Contacts */}
          <VoidCard size="sm">
            <VoidCardHeader>
              <box direction="row" justifyContent="space-between" alignY="center">
                <VoidCardTitle>Contacts</VoidCardTitle>
                <VoidBadge variant="outline">3 Online</VoidBadge>
              </box>
            </VoidCardHeader>

            <VoidCardContent>
              <box direction="column" gap={space[1.5]}>
                <For each={CONTACTS}>
                  {(contact) => (
                    <box
                      direction="row"
                      justifyContent="space-between"
                      alignY="center"
                      paddingY={space[1]}
                    >
                      <box direction="row" gap={space[2]} alignY="center">
                        <VoidAvatar name={contact.name} size="sm" color={contact.avatarColor} />
                        <text color={colors.foreground} fontSize={font.sm}>
                          {contact.name}
                        </text>
                      </box>
                      <VoidBadge variant="secondary">{contact.subtitle}</VoidBadge>
                    </box>
                  )}
                </For>
              </box>
            </VoidCardContent>
          </VoidCard>
        </box>
      </box>
    </box>
  )
}

await createApp(() => <FacebookApp />, {
  quit: ["q", "ctrl+c"],
  mount: { maxFps: 60 },
})
