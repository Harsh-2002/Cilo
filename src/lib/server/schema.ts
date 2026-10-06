import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import type { Document } from "../types";

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    completedAt: integer("completed_at"),
    trashedAt: integer("trashed_at"),
    revision: integer("revision").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    dueDate: text("due_date"),
    recurrence: text("recurrence").$type<import("../dates").Recurrence>(),
    recurrenceDay: integer("recurrence_day"),
    parentTaskId: text("parent_task_id"),
    noteId: text("note_id").references(() => notes.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("tasks_owner_created_idx").on(t.ownerId, t.createdAt)],
);

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  username: text("username").notNull().unique(),
  displayUsername: text("display_username"),
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
});
export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp_ms",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp_ms",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull().default(""),
    document: text("document", { mode: "json" }).$type<Document>().notNull(),
    kind: text("kind").$type<"note">().notNull().default("note"),
    dailyDate: text("daily_date"),
    editorWidth: text("editor_width")
      .$type<"standard" | "wide">()
      .notNull()
      .default("standard"),
    text: text("text").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    trashedAt: integer("trashed_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("notes_updated_idx").on(t.updatedAt)],
);
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("gray"),
});
export const noteTags = sqliteTable(
  "note_tags",
  {
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tagId] })],
);
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  noteId: text("note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});
export const instance = sqliteTable("instance", {
  id: integer("id").primaryKey(),
  recoveryHash: text("recovery_hash"),
  theme: text("theme").notNull().default("system"),
  uploadLimit: integer("upload_limit").notNull().default(26214400),
});

export const publications = sqliteTable("publications", {
  token: text("token").primaryKey(),
  noteId: text("note_id")
    .notNull()
    .unique()
    .references(() => notes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  document: text("document", { mode: "json" }).$type<Document>().notNull(),
  excerpt: text("excerpt").notNull(),
  revision: integer("revision").notNull(),
  publishedAt: integer("published_at").notNull(),
});
export const publicationFiles = sqliteTable(
  "publication_files",
  {
    id: text("id").primaryKey(),
    token: text("token")
      .notNull()
      .references(() => publications.token, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    storageKey: text("storage_key").notNull().unique(),
  },
  (t) => [index("publication_files_token_idx").on(t.token)],
);

export const twoFactor = sqliteTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: integer("verified", { mode: "boolean" }).default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("two_factor_user_idx").on(t.userId),
    index("two_factor_secret_idx").on(t.secret),
  ],
);

export const bookmarks = sqliteTable("bookmarks", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  noteId: text("note_id").references(() => notes.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  siteName: text("site_name").notNull().default(""),
  collection: text("collection").notNull().default(""),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  titleEdited: integer("title_edited").notNull().default(0),
  descriptionEdited: integer("description_edited").notNull().default(0),
  metadataStatus: text("metadata_status").notNull().default("unavailable"),
  thumbnailKey: text("thumbnail_key"),
  thumbnailMime: text("thumbnail_mime"),
  iconKey: text("icon_key"),
  iconMime: text("icon_mime"),
  trashedAt: integer("trashed_at"),
  revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const noteVersions = sqliteTable(
  "note_versions",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    document: text("document", { mode: "json" }).$type<Document>().notNull(),
    revision: integer("revision").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("note_versions_note_idx").on(t.noteId, t.createdAt)],
);
export const noteLinks = sqliteTable(
  "note_links",
  {
    sourceId: text("source_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.sourceId, t.targetId] }),
    index("note_links_target_idx").on(t.targetId),
  ],
);

export const backgroundJobs = sqliteTable("background_jobs", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"artifact" | "bookmark">().notNull(),
  targetId: text("target_id").notNull(),
  state: text("state")
    .$type<"queued" | "running" | "done" | "failed">()
    .notNull()
    .default("queued"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: integer("available_at").notNull(),
  leaseUntil: integer("lease_until"),
  leaseToken: text("lease_token"),
  createdAt: integer("created_at").notNull(),
});
export const completionEvents = sqliteTable("completion_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"artifact" | "bookmark" | "backup">().notNull(),
  targetId: text("target_id").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});
