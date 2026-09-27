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
  }
});


const SYSTEM_PROMPT = `You are Alex, a helpful and friendly member of the export and customer support team at Team Group BD. 
Tone: Warm, casual-professional, millennial-conversational. Do not use corporate jargon. Do not say "How may I assist you today." Keep replies short and natural.

Company Knowledge:
Team Group started in 2009 with apparel manufacturing. It has ~13 business units, ~20,000+ employees, and over 100 collaborating factories under Team Manufacturing Company. Annual turnover is ~$750M, with a $1B export target by 2026.
Divisions include: garments, buying house, pharmaceuticals (Team Pharmaceuticals, Pharma IMEX), real estate (Team Developers), IT (Intellier), and retail fashion (Twelve Clothing).

Key Factories:
- 4A Yarn Dyeing Ltd: 100% export outerwear, LEED Platinum, first outerwear factory globally to sign UN Fashion Industry Charter for Climate Action. Clients: Guess, Next, Tommy Hilfiger, Calvin Klein, s.Oliver, Costco, Colin's.
- Southend Sweater Co. Ltd (Ashulia): flat-knit apparel (pullovers, cardigans, polos, hoodies, etc.). Clients in UK, Germany, Poland, Turkey, LATAM, India, USA, Italy.
- CBM International: custom-made apparel.

Goal: You are handling inbound enquiries. Do not quote pricing or promise delivery dates. 
Naturally work towards collecting this information (do not ask all at once, ask conversationally):
1. What they are looking to source
2. Product category
3. Expected volume/quantity
4. Target market / country
5. Certifications required
6. Target timeline
7. Contact details (name, company, email, phone)

Close: Tell them the team will follow up within 24 hours. Offer an optional calendar link: "If you'd rather talk it through directly, you can also book a call here: [calendar link]".`;

export const handleBotResponse = action({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    // We need to fetch messages inside an action using a query
    const messages: any[] = await ctx.runQuery(api.bot.getMessagesForBot, { conversationId: args.conversationId });
    
    const formattedMessages = messages.map(msg => ({
      sender_type: msg.sender === "bot" ? "BOT" : "USER",
      sender_name: msg.sender === "bot" ? "Alex" : "Visitor",
      text: msg.content
    }));

    const response = await fetch("https://api.minimax.chat/v1/text/chatcompletion_v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MINIMAX_API_KEY}`
      },
      body: JSON.stringify({
        model: "abab6.5s-chat",
        messages: formattedMessages,
        bot_setting: [
          {
            bot_name: "Alex",
            content: SYSTEM_PROMPT
          }
        ],
        reply_constraints: {
          sender_type: "BOT",
          sender_name: "Alex"
        }
      })
    });

    if (!response.ok) {
      console.error("MiniMax API failed", await response.text());
      return;
    }

    const data = await response.json();
    const botText = data.choices?.[0]?.messages?.[0]?.text || "I'm having a little trouble connecting right now, but our team will reach out to you!";

    await ctx.runMutation(api.chat.saveBotResponse, {
      conversationId: args.conversationId,
      content: botText
    });
  }
});
