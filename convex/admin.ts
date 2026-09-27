import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Very basic hash for demo purposes, in production use a proper salt + bcrypt
function simpleHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

export const createInitialAdmin = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("adminUsers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      // Update password if it already exists
      await ctx.db.patch(existing._id, {
        passwordHash: simpleHash(args.password),
      });
      return "Updated existing admin";
    }

    await ctx.db.insert("adminUsers", {
      name: "Mohammad Sayem",
      email: args.email,
      passwordHash: simpleHash(args.password),
      role: "owner",
    });
    return "Created new admin";
  },
});

export const login = query({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("adminUsers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) return { success: false, error: "User not found" };

    if (user.passwordHash !== simpleHash(args.password)) {
      return { success: false, error: "Invalid password" };
    }

    return { success: true, user: { id: user._id, name: user.name, role: user.role } };
  }
});
