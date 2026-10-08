export interface TreeTask {
  id: string;
  parent_task_id: string | null;
}

export interface TaskRow<T extends TreeTask> {
  task: T;
  depth: number;
  hasChildren: boolean;
}

export const INDENT_PX_PER_LEVEL = 20;

// Orders tasks as a tree (children under their parent, in the order given). A
// task whose parent is not in the list — filtered out or not visible to this
// user — is shown at the top level.
export function buildTaskRows<T extends TreeTask>(tasks: T[]): TaskRow<T>[] {
  const visibleIds = new Set(tasks.map(task => task.id));
  const childrenByParent = new Map<string | null, T[]>();
  for (const task of tasks) {
    const parentId = task.parent_task_id && visibleIds.has(task.parent_task_id) ? task.parent_task_id : null;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), task]);
  }
  const rows: TaskRow<T>[] = [];
  const appendLevel = (parentId: string | null, depth: number): void => {
    for (const task of childrenByParent.get(parentId) ?? []) {
      rows.push({ task, depth, hasChildren: childrenByParent.has(task.id) });
      appendLevel(task.id, depth + 1);
    }
  };
  appendLevel(null, 0);
  return rows;
}
