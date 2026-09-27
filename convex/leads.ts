import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const saveLead = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("leads")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .first();

    const leadData = { ...args };
    delete leadData.conversationId;

    // Filter out undefined/empty
    Object.keys(leadData).forEach(key => {
      if (!leadData[key] || leadData[key] === "Unknown") {
        delete leadData[key];
      }
    });

    // Score calculation
    let score = 0;
    if (leadData.email || leadData.phone) score += 30;
    if (leadData.company) score += 20;
    if (leadData.volume) score += 20;
    if (leadData.productCategory) score += 15;
    if (leadData.country) score += 15;
    
    let leadScore = "Cold";
    if (score >= 40) leadScore = "Warm";
    if (score >= 70) leadScore = "Hot";
    
    leadData.leadScore = leadScore;

    if (existing) {
      await ctx.db.patch(existing._id, leadData);
    } else if (Object.keys(leadData).length > 1) { // More than just leadScore
      await ctx.db.insert("leads", {
        conversationId: args.conversationId,
        ...leadData
      });
    }
  }
});

const EXTRACTOR_PROMPT = `You are a data extraction bot.
Read the following chat transcript between a visitor and a bot.
Extract any available lead information.
Return ONLY a raw JSON object with these keys (use "Unknown" if not found):
- name
- company
- email
- phone
- productCategory
- volume
- country
- certifications
- timeline

Do not include markdown blocks or any other text. Just the JSON object.`;

export const extractLead = action({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.runQuery(api.bot.getMessagesForBot, { conversationId: args.conversationId });
    if (messages.length < 2) return; // Not enough context

    const transcript = messages.map(m => `${m.sender}: ${m.content}`).join("\n");

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer ",
          "HTTP-Referer": "https://teambd.com",
          "X-Title": "Team Group BD Extraction",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-exp:free",
          messages: [
            { role: "system", content: EXTRACTOR_PROMPT },
            { role: "user", content: transcript }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      });

      const data = await response.json();
      const rawJson = data.choices?.[0]?.message?.content;
      
      if (rawJson) {
        // Strip any markdown if the model ignored instructions
        const cleanJson = rawJson.replace(/^```json\n/, "").replace(/\n```$/, "");
        const parsed = JSON.parse(cleanJson);
        
        await ctx.runMutation(api.leads.saveLead, {
          conversationId: args.conversationId,
          ...parsed
        });
      }
    } catch (e) {
      console.error("Lead extraction failed:", e);
    }
  }
});

export const getLeads = query({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").order("desc").collect();
    
    // Enrich with session ID for UI linkage
    const enriched = await Promise.all(leads.map(async (l) => {
      const conv = await ctx.db.get(l.conversationId);
      return {
        ...l,
        sessionId: conv ? conv.sessionId : "Unknown"
      };
    }));
    
    return enriched;
  }
});
