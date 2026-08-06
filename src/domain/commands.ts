export type Command =
  | { type: 'CREATE_PROJECT'; name: string }
  | { type: 'CREATE_SUBPROJECT'; parentId: string; name: string }
  | { type: 'RENAME_PROJECT'; projectId: string; name: string }
  | { type: 'REORDER_PROJECT'; projectId: string; toIndex: number }
  /** Move a project (and its whole subtree) to become the `toIndex`-th child of `newParentId` (null = root). Default `toIndex` = end of the destination's children. */
  | { type: 'REPARENT_PROJECT'; projectId: string; newParentId: string | null; toIndex?: number }
  /** Deletes the project and its entire subtree. */
  | { type: 'DELETE_PROJECT'; projectId: string }
  | { type: 'CREATE_SAVED_URL'; projectId: string; url: string; title?: string; tags?: string[]; notes?: string }
  | {
      type: 'UPDATE_SAVED_URL'
      projectId: string
      savedUrlId: string
      changes: { url?: string; title?: string; tags?: string[]; notes?: string }
    }
  | { type: 'REORDER_SAVED_URL'; projectId: string; savedUrlId: string; toIndex: number }
  | { type: 'COPY_SAVED_URL'; sourceProjectId: string; savedUrlId: string; targetProjectId: string }
  | { type: 'DELETE_SAVED_URL'; projectId: string; savedUrlId: string }
  | { type: 'FILE_LIVE_TAB'; projectId: string; url: string; capturedTitle?: string; suggestedTags: string[]; notes?: string }
  | { type: 'ARCHIVE_SAVED_URL'; projectId: string; savedUrlId: string; archived: boolean }
  /** Archives/unarchives the project and its entire subtree. */
  | { type: 'ARCHIVE_PROJECT'; projectId: string; archived: boolean }

export interface CommandResultMeta {
  affectedProjectId?: string
  /** Every project id touched by a subtree-scoped command (archive, reparent, …). */
  affectedProjectIds?: string[]
  /** Every project id removed by a subtree deletion, including the root project. */
  deletedProjectIds?: string[]
  affectedSavedUrlId?: string
  existingSavedUrlId?: string
  didWrite: boolean
  filing?: 'created' | 'reused'
}
