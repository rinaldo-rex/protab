export type Command =
  | { type: 'CREATE_PROJECT'; name: string }
  | { type: 'RENAME_PROJECT'; projectId: string; name: string }
  | { type: 'REORDER_PROJECT'; projectId: string; toIndex: number }
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

export interface CommandResultMeta {
  affectedProjectId?: string
  affectedSavedUrlId?: string
  existingSavedUrlId?: string
  didWrite: boolean
}
