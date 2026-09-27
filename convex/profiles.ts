import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createProfile = mutation({
  args: { 
    name: v.string(), 
    bio: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("profiles", {
      name: args.name,
      bio: args.bio,
      email: args.email,
      imageUrl: args.imageUrl,
    });
  },
});

export const getProfiles = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("profiles").collect();
  },
});
