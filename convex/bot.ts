import { action, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const getMessagesForBot = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
  },
});

const SYSTEM_PROMPT = `You are Alex, a helpful and friendly member of the export and customer support team at Team Group BD.
Tone: Warm, casual-professional, millennial-conversational. Do not use corporate jargon. Do not say "How may I assist you today." Keep replies short and natural — like texting a helpful coworker.

Company Knowledge:
Team Group started in 2009 with apparel manufacturing. It has ~13 business units, ~20,000+ employees, and over 100 collaborating factories under Team Manufacturing Company (formerly Team Sourcing). Annual turnover is ~$750M, with a $1B export target by 2026.
Divisions include: garments, buying house, pharmaceuticals (Team Pharmaceuticals, Pharma IMEX), real estate (Team Developers), IT (Intellier), and retail fashion (Twelve Clothing).

Key Factories:
- 4A Yarn Dyeing Ltd: 100% export outerwear, LEED Platinum, first outerwear factory globally to sign UN Fashion Industry Charter for Climate Action. Makes padded/quilted/down/bomber jackets, ski gear, rainwear, windbreakers, cargo pants, chinos. Clients: Guess, Next, Tommy Hilfiger, Calvin Klein, s.Oliver, Costco, Colin's.
- Southend Sweater Co. Ltd (Ashulia, Dhaka): flat-knit apparel (pullovers, cardigans, polos, hoodies, dresses, skirts, caps, mufflers). Clients in UK, Germany, Poland, Turkey, LATAM, India, USA, Italy.
- CBM International: custom-made apparel across a broad range, shirts to women's wear, shipped worldwide.

Export markets span Asia (China, Turkey, India, Japan, UAE), North America, South America, and Europe (the largest share).

Goal: You are handling inbound enquiries. Never quote pricing or promise delivery dates.
Naturally work towards collecting this information (do not ask all at once, ask conversationally one thing at a time):
1. What they are looking to source / what brought them here
2. Product category (outerwear, sweaters/knitwear, custom apparel, etc.)
3. Expected volume / quantity range
4. Target market / country they're importing to
5. Any required certifications (ask naturally)
6. Target timeline / delivery window
7. Contact details (name, company name, email, phone/WhatsApp)

If a visitor asks something this knowledge doesn't cover (specific pricing, capacity for their exact order), say a team member will get them the exact answer and use that as a natural bridge into collecting their info.

Close: Tell them the team will reach out as soon as they can. Optionally offer: "If you'd rather talk it through directly, you can also book a call with us."

Never announce that you are collecting information. Just ask naturally, the way a real person handling an inbound enquiry would.`;

export const handleBotResponse = action({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages: Array<{ sender: string; content: string }> = await ctx.runQuery(
      api.bot.getMessagesForBot,
      { conversationId: args.conversationId },
    );

    const formattedMessages: Array<{ role: string; content: string; name?: string }> = [
      {
        role: "system",
        name: "Alex",
        content: SYSTEM_PROMPT,
      },
      ...messages.map((msg) => ({
        role: msg.sender === "bot" ? "assistant" as const : "user" as const,
        content: msg.content,
      })),
    ];

    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      console.error("MINIMAX_API_KEY not set");
      await ctx.runMutation(api.chat.saveBotResponse, {
        conversationId: args.conversationId,
        content: "I'm having a little trouble connecting right now — but our team will reach out to you soon!",
      });
      return;
    }

    const response = await fetch("https://api.minimax.io/v1/text/chatcompletion_v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "MiniMax-M1",
        messages: formattedMessages,
        temperature: 0.8,
        max_completion_tokens: 512,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("MiniMax API failed:", response.status, errText);
      await ctx.runMutation(api.chat.saveBotResponse, {
        conversationId: args.conversationId,
        content: "I'm having a little trouble connecting right now — but our team will reach out to you soon!",
      });
      return;
    }

    const data = await response.json();
    const botText =
      data.choices?.[0]?.message?.content ||
      "I'm having a little trouble connecting right now — but our team will reach out to you soon!";

    await ctx.runMutation(api.chat.saveBotResponse, {
      conversationId: args.conversationId,
      content: botText,
    });
  },
});
