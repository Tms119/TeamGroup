import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    sessionId: v.string(),
    status: v.union(v.literal("active"), v.literal("completed"), v.literal("abandoned")),
    lastMessageAt: v.number(),
  }).index("by_sessionId", ["sessionId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    sender: v.union(v.literal("visitor"), v.literal("bot")),
    content: v.string(),
  }).index("by_conversation", ["conversationId"]),

  leads: defineTable({
    conversationId: v.id("conversations"),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    productCategory: v.optional(v.string()),
    volume: v.optional(v.string()),
    country: v.optional(v.string()),
    certifications: v.optional(v.string()),
    timeline: v.optional(v.string()),
    leadScore: v.optional(v.string()),
  }).index("by_conversation", ["conversationId"]),

  adminUsers: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("viewer")),
    invitedBy: v.optional(v.string()),
  }).index("by_email", ["email"]),
});
