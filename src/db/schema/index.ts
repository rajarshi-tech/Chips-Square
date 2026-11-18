/**
 * Schema barrel. Import from "@/db/schema" everywhere — never from a submodule directly,
 * so tables can be reorganised without touching call sites.
 */
export * from "./enums";
export * from "./identity";
export * from "./catalog";
export * from "./purchasing";
export * from "./stock";
export * from "./sales";
export * from "./payments";
export * from "./settlement";
export * from "./feedback";
export * from "./system";
