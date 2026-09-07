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
import { createApp, useAppTerminal, Box, Text } from "@vexart/app"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Avatar,
  Separator,
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
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      direction="column"
    >
      {/* ──────────────────────────────────────────────────────────────────────────
          1. TOP NAVIGATION HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <Box
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
        <Box direction="row" alignY="center" gap={space[3]}>
          <Box direction="row" alignY="center" gap={space[2]}>
            <Box
              width={34}
              height={34}
              cornerRadius={radius.full}
              backgroundColor="#1877f2"
              alignX="center"
              alignY="center"
            >
              <Text color="#ffffff" fontSize={font.xl} fontWeight={weight.bold}>
                f
              </Text>
            </Box>
            <Text color={colors.foreground} fontSize={font.lg} fontWeight={weight.bold}>
              Facebook
            </Text>
          </Box>

          <VoidInput
            value={searchQuery()}
            onChange={setSearchQuery}
            placeholder="Search Facebook..."
            width={220}
          />
        </Box>

        {/* Center: Navigation Tabs */}
        <Box direction="row" alignX="center" alignY="center" gap={space[1]}>
          <For each={navTabs}>
            {(tabLabel, index) => {
              const isActive = () => navTab() === index()
              return (
                <Button
                  variant={isActive() ? "default" : "ghost"}
                  size="sm"
                  onPress={() => setNavTab(index())}
                >
                  {tabLabel}
                </Button>
              )
            }}
          </For>
        </Box>

        {/* Right: Actions & User Avatar */}
        <Box direction="row" alignY="center" gap={space[2]} justifyContent="flex-end">
          <Button variant="secondary" size="sm">
            <Box direction="row" alignY="center" gap={space[1.5]}>
              <Text color={colors.foreground} fontSize={font.sm}>
                Chat
              </Text>
              <Badge variant="destructive">1</Badge>
            </Box>
          </Button>

          <Button variant="secondary" size="sm">
            <Box direction="row" alignY="center" gap={space[1.5]}>
              <Text color={colors.foreground} fontSize={font.sm}>
                Bell
              </Text>
              <Badge variant="destructive">15</Badge>
            </Box>
          </Button>

          <Avatar name="Carlos Gonzalez" size="sm" color="#1877f2" />
        </Box>
      </Box>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. 3-COLUMN MAIN BODY LAYOUT
          ────────────────────────────────────────────────────────────────────────── */}
      <Box
        direction="row"
        width="100%"
        height="grow"
        gap={space[3]}
        padding={space[3]}
      >
        {/* ── LEFT COLUMN (Profile & Shortcuts) ─────────────────────────── */}
        <Box width={260} direction="column" gap={space[3]}>
          <Card size="sm">
            <CardHeader>
              <Box direction="row" alignY="center" gap={space[2.5]}>
                <Avatar name="Carlos Gonzalez" size="default" color="#1877f2" />
                <Box direction="column" gap={space[0.5]}>
                  <CardTitle>Carlos Gonzalez</CardTitle>
                  <CardDescription>View profile</CardDescription>
                </Box>
              </Box>
            </CardHeader>

            <CardContent>
              <Box direction="column" gap={space[1]}>
                <Button variant="ghost" size="sm" onPress={() => {}}>
                  Meta AI
                </Button>
                <Button variant="ghost" size="sm" onPress={() => {}}>
                  Friends
                </Button>
                <Button variant="ghost" size="sm" onPress={() => {}}>
                  Memories
                </Button>
                <Button variant="ghost" size="sm" onPress={() => {}}>
                  Saved
                </Button>
                <Button variant="ghost" size="sm" onPress={() => {}}>
                  Groups
                </Button>
              </Box>
            </CardContent>

            <Separator />

            <CardHeader>
              <CardTitle>Your shortcuts</CardTitle>
            </CardHeader>

            <CardContent>
              <Box direction="column" gap={space[1]}>
                <Button variant="ghost" size="sm" onPress={() => {}}>
                  Buy Salvage Autos
                </Button>
                <Button variant="ghost" size="sm" onPress={() => {}}>
                  Dealer OS
                </Button>
                <Button variant="ghost" size="sm" onPress={() => {}}>
                  Deluxe Cars Miami
                </Button>
                <Button variant="ghost" size="sm" onPress={() => {}}>
                  Only Luxury Rentals
                </Button>
              </Box>
            </CardContent>

            <CardFooter>
              <Text color={colors.mutedForeground} fontSize={font.xs}>
                Meta © 2026 · Vexart Engine
              </Text>
            </CardFooter>
          </Card>
        </Box>

        {/* ── CENTER COLUMN (Create Post, Stories & Vesper Sienna Post) ──── */}
        <Box width="grow" direction="column" gap={space[3]}>
          {/* 1. Create Post */}
          <Card size="sm">
            <CardContent>
              <Box direction="column" gap={space[3]}>
                <Box direction="row" alignY="center" gap={space[2.5]}>
                  <Avatar name="Carlos Gonzalez" size="default" color="#1877f2" />
                  <Box width="grow">
                    <VoidInput
                      value={newPostText()}
                      onChange={setNewPostText}
                      onSubmit={handleCreatePost}
                      placeholder="What's on your mind, Carlos?"
                      width="grow"
                    />
                  </Box>
                </Box>

                <Separator />

                <Box direction="row" justifyContent="space-between" alignY="center">
                  <Box direction="row" gap={space[1.5]}>
                    <Button variant="ghost" size="xs">
                      Live video
                    </Button>
                    <Button variant="ghost" size="xs">
                      Photo/video
                    </Button>
                    <Button variant="ghost" size="xs">
                      Feeling/activity
                    </Button>
                  </Box>

                  <Button variant="default" size="xs" onPress={handleCreatePost}>
                    Post
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* 2. Stories Carousel */}
          <Card size="sm">
            <CardHeader>
              <Box direction="row" justifyContent="space-between" alignY="center">
                <CardTitle>Stories</CardTitle>
                <Badge variant="outline">See all</Badge>
              </Box>
            </CardHeader>

            <CardContent>
              <Box direction="row" gap={space[2]} width="100%">
                <Box
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
                  <Box
                    width={36}
                    height={36}
                    cornerRadius={radius.full}
                    backgroundColor="#1877f2"
                    alignX="center"
                    alignY="center"
                  >
                    <Text color="#ffffff" fontSize={font.xl} fontWeight={weight.bold}>
                      +
                    </Text>
                  </Box>
                  <Text color={colors.foreground} fontSize={font.xs} fontWeight={weight.semibold}>
                    Create story
                  </Text>
                </Box>

                <For each={STORIES}>
                  {(story) => (
                    <Box
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
                      <Avatar name={story.author} size="sm" color={story.avatarColor} />
                      <Box direction="column" gap={space[0.5]}>
                        <Badge variant="secondary">Story</Badge>
                        <Text
                          color={colors.foreground}
                          fontSize={font.xs}
                          fontWeight={weight.semibold}
                        >
                          {story.author}
                        </Text>
                      </Box>
                    </Box>
                  )}
                </For>
              </Box>
            </CardContent>
          </Card>

          {/* 3. Vesper Sienna Post */}
          <Card size="sm">
            <CardHeader>
              <Box direction="row" justifyContent="space-between" alignY="center">
                <Box direction="row" gap={space[2.5]} alignY="center">
                  <Avatar name="Vesper Sienna" size="default" color="#9333ea" />
                  <Box direction="column" gap={space[0.5]}>
                    <CardTitle>Vesper Sienna</CardTitle>
                    <CardDescription>4h · GTA San Andreas Theme</CardDescription>
                  </Box>
                </Box>
                <Badge variant="outline">Online</Badge>
              </Box>
            </CardHeader>

            <CardContent>
              <Box direction="column" gap={space[3]}>
                <Text color={colors.foreground} fontSize={font.base}>
                  Soy un personaje online facha
                </Text>

                {/* Vice City Neon Banner */}
                <Box
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
                  <Box direction="row" justifyContent="space-between" alignY="center">
                    <Text color="#06b6d4" fontSize={font.xs} fontWeight={weight.bold}>
                      ✦ SUNSET STRIP - 80s NEON ✦
                    </Text>
                    <Text color="#ec4899" fontSize={font.xs} fontWeight={weight.bold}>
                      VICE CITY, FL
                    </Text>
                  </Box>

                  <Box direction="column" alignX="center" alignY="center" gap={space[0.5]}>
                    <Text color="#ec4899" fontSize={font.xl} fontWeight={weight.bold}>
                      VICE CITY MOTEL
                    </Text>
                    <Text color="#f472b6" fontSize={font.xs} fontWeight={weight.medium}>
                      VACANCY · OCEAN DRIVE · 1986
                    </Text>
                  </Box>

                  <Box direction="row" justifyContent="space-between" alignY="center">
                    <Text color="#a855f7" fontSize={font.xs}>
                      PALM BEACH AVE
                    </Text>
                    <Text color="#06b6d4" fontSize={font.xs} fontWeight={weight.bold}>
                      GRAND THEFT AUTO THEME
                    </Text>
                  </Box>
                </Box>

                {/* Post Stats */}
                <Box direction="row" justifyContent="space-between" alignY="center">
                  <Text color={colors.mutedForeground} fontSize={font.sm}>
                    {vesperLikes()} likes
                  </Text>
                  <Text color={colors.mutedForeground} fontSize={font.sm}>
                    {vesperComments().length + 140} comments · {vesperShares()} shares
                  </Text>
                </Box>

                <Separator />

                {/* Post Action Buttons */}
                <Box direction="row" gap={space[2]} justifyContent="space-between">
                  <Button
                    variant={isLikedVesper() ? "default" : "secondary"}
                    size="sm"
                    onPress={handleToggleLikeVesper}
                  >
                    {isLikedVesper() ? "✓ Liked" : "Like"}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => setShowVesperComments(!showVesperComments())}
                  >
                    {showVesperComments() ? "Hide Comments" : "Comment"}
                  </Button>

                  <Button variant="secondary" size="sm" onPress={handleShareVesper}>
                    Share
                  </Button>
                </Box>

                {/* Collapsible Comments Section */}
                <Show when={showVesperComments()}>
                  <Separator />

                  <Box direction="column" gap={space[2.5]}>
                    <For each={vesperComments()}>
                      {(comment) => (
                        <Box direction="row" gap={space[2]} alignY="top">
                          <Avatar name={comment.author} size="sm" color={comment.avatarColor} />
                          <Box
                            backgroundColor={colors.secondary}
                            padding={space[2]}
                            cornerRadius={radius.md}
                            direction="column"
                            gap={space[0.5]}
                            width="grow"
                          >
                            <Box direction="row" gap={space[1.5]} alignY="center">
                              <Text
                                color={colors.foreground}
                                fontSize={font.xs}
                                fontWeight={weight.bold}
                              >
                                {comment.author}
                              </Text>
                              <Text color={colors.mutedForeground} fontSize={font.xs}>
                                · {comment.time}
                              </Text>
                            </Box>
                            <Text color={colors.foreground} fontSize={font.sm}>
                              {comment.text}
                            </Text>
                          </Box>
                        </Box>
                      )}
                    </For>

                    {/* Add Comment Input */}
                    <Box direction="row" gap={space[2]} alignY="center" marginTop={space[1]}>
                      <Avatar name="Carlos Gonzalez" size="sm" color="#1877f2" />
                      <Box width="grow">
                        <VoidInput
                          value={newCommentInput()}
                          onChange={setNewCommentInput}
                          onSubmit={handleAddVesperComment}
                          placeholder="Write a comment..."
                          width="grow"
                        />
                      </Box>
                      <Button variant="default" size="sm" onPress={handleAddVesperComment}>
                        Send
                      </Button>
                    </Box>
                  </Box>
                </Show>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* ── RIGHT COLUMN (Friend Requests, Messenger & Contacts) ──────── */}
        <Box width={300} direction="column" gap={space[3]}>
          {/* 1. Friend Requests */}
          <Card size="sm">
            <CardHeader>
              <Box direction="row" justifyContent="space-between" alignY="center">
                <CardTitle>Friend requests</CardTitle>
                <Badge variant="secondary">1</Badge>
              </Box>
            </CardHeader>

            <CardContent>
              <Show
                when={!friendRequestConfirmed() && !friendRequestDeleted()}
                fallback={
                  <Show
                    when={friendRequestConfirmed()}
                    fallback={
                      <Text color={colors.mutedForeground} fontSize={font.sm}>
                        Request removed
                      </Text>
                    }
                  >
                    <Badge variant="outline">✓ Request confirmed</Badge>
                  </Show>
                }
              >
                <Box direction="column" gap={space[3]}>
                  <Box direction="row" gap={space[2.5]} alignY="center">
                    <Avatar name="Paul Fran" size="default" color="#6366f1" />
                    <Box direction="column" gap={space[0.5]}>
                      <Text
                        color={colors.foreground}
                        fontSize={font.sm}
                        fontWeight={weight.semibold}
                      >
                        Paul Fran
                      </Text>
                      <Text color={colors.mutedForeground} fontSize={font.xs}>
                        1d · 4 mutual friends
                      </Text>
                    </Box>
                  </Box>

                  <Box direction="row" gap={space[2]}>
                    <Button
                      variant="default"
                      size="sm"
                      onPress={() => setFriendRequestConfirmed(true)}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => setFriendRequestDeleted(true)}
                    >
                      Delete
                    </Button>
                  </Box>
                </Box>
              </Show>
            </CardContent>
          </Card>

          {/* 2. Marketplace & Messenger Chat */}
          <Card size="sm">
            <CardHeader>
              <Box direction="row" justifyContent="space-between" alignY="center">
                <Box direction="row" gap={space[2]} alignY="center">
                  <Avatar name="Daniel" size="sm" color="#10b981" />
                  <CardTitle>Daniel · 2019 Jeep</CardTitle>
                </Box>
                <Badge variant="outline">$10,980</Badge>
              </Box>
              <CardDescription>Marketplace · 2019 Jeep Wrangler</CardDescription>
            </CardHeader>

            <CardContent>
              <Box direction="column" gap={space[2]}>
                {/* Chat History */}
                <Box direction="column" gap={space[1.5]} paddingY={space[1]}>
                  <For each={chatMessages()}>
                    {(msg) => {
                      const isMe = msg.sender === "me"
                      return (
                        <Box alignX={isMe ? "right" : "left"} direction="column" gap={space[0.5]}>
                          <Box
                            backgroundColor={isMe ? "#0084ff" : colors.secondary}
                            paddingX={space[2.5]}
                            paddingY={space[1.5]}
                            cornerRadius={radius.md}
                          >
                            <Text color="#ffffff" fontSize={font.xs}>
                              {msg.text}
                            </Text>
                          </Box>
                          <Text
                            color={colors.mutedForeground}
                            fontSize={font.xs}
                            alignX={isMe ? "right" : "left"}
                          >
                            {isMe ? `${msg.time} · Seen` : msg.time}
                          </Text>
                        </Box>
                      )
                    }}
                  </For>
                </Box>

                {/* Chat Input */}
                <Box direction="row" gap={space[1.5]} alignY="center">
                  <Box width="grow">
                    <VoidInput
                      value={chatInput()}
                      onChange={setChatInput}
                      onSubmit={handleSendChatMessage}
                      placeholder="Aa..."
                      width="grow"
                    />
                  </Box>
                  <Button variant="default" size="sm" onPress={handleSendChatMessage}>
                    Send
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* 3. Online Contacts */}
          <Card size="sm">
            <CardHeader>
              <Box direction="row" justifyContent="space-between" alignY="center">
                <CardTitle>Contacts</CardTitle>
                <Badge variant="outline">3 Online</Badge>
              </Box>
            </CardHeader>

            <CardContent>
              <Box direction="column" gap={space[1.5]}>
                <For each={CONTACTS}>
                  {(contact) => (
                    <Box
                      direction="row"
                      justifyContent="space-between"
                      alignY="center"
                      paddingY={space[1]}
                    >
                      <Box direction="row" gap={space[2]} alignY="center">
                        <Avatar name={contact.name} size="sm" color={contact.avatarColor} />
                        <Text color={colors.foreground} fontSize={font.sm}>
                          {contact.name}
                        </Text>
                      </Box>
                      <Badge variant="secondary">{contact.subtitle}</Badge>
                    </Box>
                  )}
                </For>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  )
}

await createApp(() => <FacebookApp />, {
  quit: ["q", "ctrl+c"],
  mount: { maxFps: 60 },
})
