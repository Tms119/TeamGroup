import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const getMessages = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!conversation) return [];

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .collect();
  },
});

export const sendMessage = mutation({
  args: { sessionId: v.string(), content: v.string() },
  handler: async (ctx, args) => {
    let conversation = await ctx.db
      .query("conversations")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!conversation) {
      const convId = await ctx.db.insert("conversations", {
        sessionId: args.sessionId,
        status: "active",
        lastMessageAt: Date.now(),
      });
      conversation = await ctx.db.get(convId);
    } else {
      await ctx.db.patch(conversation._id, { lastMessageAt: Date.now() });
    }

    if (conversation) {
      await ctx.db.insert("messages", {
        conversationId: conversation._id,
        sender: "visitor",
        content: args.content,
      });

      // Schedule bot response
      await ctx.scheduler.runAfter(0, api.bot.handleBotResponse, {
        conversationId: conversation._id,
      });
    }
  },
});

export const saveBotResponse = mutation({
  args: { conversationId: v.id("conversations"), content: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      sender: "bot",
      content: args.content,
    });
    await ctx.db.patch(args.conversationId, { lastMessageAt: Date.now() });
    
    // Trigger background extraction of leads
    await ctx.scheduler.runAfter(0, api.leads.extractLead, {
      conversationId: args.conversationId,
    });
  },
});
