import { createTool } from "@mastra/core/tools";
import { z } from "zod";

interface Task {
  title: string;
  description: string;
  type: string;
  priority: string;
  assignee?: string;
  dueDate?: string;
  dependencies?: string[];
  effort?: string;
  status: string;
}

interface ProjectData {
  name: string;
  description: string;
  tasks: Task[];
  timeline?: {
    startDate: string;
    endDate: string;
    phases: Array<{
      name: string;
      tasks: string[];
      duration: string;
    }>;
  };
}

export const documentExportTool = createTool({
  id: "document-export",
  description: "Export project data to markdown document",
  inputSchema: z.object({
    projectData: z.object({
      name: z.string(),
      description: z.string(),
      tasks: z.array(z.object({
        title: z.string(),
        description: z.string(),
        type: z.string(),
        priority: z.string(),
        assignee: z.string().optional(),
        dueDate: z.string().optional(),
        dependencies: z.array(z.string()).optional(),
        effort: z.string().optional(),
        status: z.string(),
      })),
      timeline: z.object({
        startDate: z.string(),
        endDate: z.string(),
        phases: z.array(z.object({
          name: z.string(),
          tasks: z.array(z.string()),
          duration: z.string(),
        })),
      }).optional(),
    }),
    format: z.enum(["detailed", "summary", "timeline"]).default("detailed"),
    includeMetadata: z.boolean().default(true),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.object({
      markdown: z.string(),
      filename: z.string(),
      stats: z.object({
        totalTasks: z.number(),
        tasksByType: z.record(z.number()),
        tasksByPriority: z.record(z.number()),
        tasksByStatus: z.record(z.number()),
      }),
    }),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { projectData, format, includeMetadata } = context;
    
    try {
      const markdown = generateMarkdown(projectData, format, includeMetadata);
      const filename = `${projectData.name.replace(/\s+/g, '-').toLowerCase()}-project-plan.md`;
      const stats = generateStats(projectData.tasks);
      
      return {
        success: true,
        data: {
          markdown,
          filename,
          stats,
        },
      };
    } catch (error) {
      return {
        success: false,
        data: {
          markdown: "",
          filename: "",
          stats: {
            totalTasks: 0,
            tasksByType: {},
            tasksByPriority: {},
            tasksByStatus: {},
          },
        },
        error: error.message,
      };
    }
  },
});

function generateMarkdown(projectData: ProjectData, format: string, includeMetadata: boolean): string {
  const { name, description, tasks, timeline } = projectData;
  let markdown = "";
  
  // Header
  markdown += `# ${name}\n\n`;
  markdown += `${description}\n\n`;
  
  if (includeMetadata) {
    markdown += `**Generated:** ${new Date().toISOString().split('T')[0]}\n`;
    markdown += `**Total Tasks:** ${tasks.length}\n\n`;
  }
  
  // Table of Contents
  markdown += `## Table of Contents\n\n`;
  markdown += `- [Project Overview](#project-overview)\n`;
  markdown += `- [Tasks](#tasks)\n`;
  if (timeline) {
    markdown += `- [Timeline](#timeline)\n`;
  }
  markdown += `- [Task Summary](#task-summary)\n\n`;
  
  // Project Overview
  markdown += `## Project Overview\n\n`;
  markdown += `${description}\n\n`;
  
  const stats = generateStats(tasks);
  markdown += `### Project Statistics\n\n`;
  markdown += `- **Total Tasks:** ${stats.totalTasks}\n`;
  markdown += `- **By Type:** ${Object.entries(stats.tasksByType).map(([type, count]) => `${type}: ${count}`).join(', ')}\n`;
  markdown += `- **By Priority:** ${Object.entries(stats.tasksByPriority).map(([priority, count]) => `${priority}: ${count}`).join(', ')}\n`;
  markdown += `- **By Status:** ${Object.entries(stats.tasksByStatus).map(([status, count]) => `${status}: ${count}`).join(', ')}\n\n`;
  
  // Tasks Section
  markdown += `## Tasks\n\n`;
  
  if (format === "summary") {
    markdown += generateTaskSummary(tasks);
  } else if (format === "timeline") {
    markdown += generateTimelineView(tasks, timeline);
  } else {
    markdown += generateDetailedTasks(tasks);
  }
  
  // Timeline Section
  if (timeline) {
    markdown += `## Timeline\n\n`;
    markdown += `**Project Duration:** ${timeline.startDate} to ${timeline.endDate}\n\n`;
    
    if (timeline.phases && timeline.phases.length > 0) {
      markdown += `### Project Phases\n\n`;
      for (const phase of timeline.phases) {
        markdown += `#### ${phase.name}\n`;
        markdown += `**Duration:** ${phase.duration}\n\n`;
        
        if (phase.tasks && phase.tasks.length > 0) {
          markdown += `**Tasks in this phase:**\n`;
          for (const taskTitle of phase.tasks) {
            const task = tasks.find(t => t.title === taskTitle);
            if (task) {
              markdown += `- ${task.title} (${task.type}, ${task.priority})\n`;
            }
          }
          markdown += `\n`;
        }
      }
    }
  }
  
  // Task Summary
  markdown += `## Task Summary\n\n`;
  markdown += generateTaskTable(tasks);
  
  return markdown;
}

function generateDetailedTasks(tasks: Task[]): string {
  let markdown = "";
  
  // Group tasks by type
  const tasksByType = tasks.reduce((acc, task) => {
    if (!acc[task.type]) acc[task.type] = [];
    acc[task.type].push(task);
    return acc;
  }, {} as Record<string, Task[]>);
  
  for (const [type, typeTasks] of Object.entries(tasksByType)) {
    markdown += `### ${type}s\n\n`;
    
    for (const task of typeTasks) {
      markdown += `#### ${task.title}\n\n`;
      markdown += `${task.description}\n\n`;
      
      markdown += `**Details:**\n`;
      markdown += `- **Type:** ${task.type}\n`;
      markdown += `- **Priority:** ${task.priority}\n`;
      markdown += `- **Status:** ${task.status}\n`;
      
      if (task.assignee) {
        markdown += `- **Assignee:** ${task.assignee}\n`;
      }
      
      if (task.dueDate) {
        markdown += `- **Due Date:** ${task.dueDate}\n`;
      }
      
      if (task.effort) {
        markdown += `- **Effort:** ${task.effort}\n`;
      }
      
      if (task.dependencies && task.dependencies.length > 0) {
        markdown += `- **Dependencies:** ${task.dependencies.join(', ')}\n`;
      }
      
      markdown += `\n`;
    }
  }
  
  return markdown;
}

function generateTaskSummary(tasks: Task[]): string {
  let markdown = "";
  
  // Group by priority
  const tasksByPriority = tasks.reduce((acc, task) => {
    if (!acc[task.priority]) acc[task.priority] = [];
    acc[task.priority].push(task);
    return acc;
  }, {} as Record<string, Task[]>);
  
  const priorityOrder = ['High', 'Medium', 'Low'];
  
  for (const priority of priorityOrder) {
    const priorityTasks = tasksByPriority[priority];
    if (priorityTasks && priorityTasks.length > 0) {
      markdown += `### ${priority} Priority\n\n`;
      
      for (const task of priorityTasks) {
        markdown += `- **${task.title}** (${task.type})`;
        if (task.assignee) markdown += ` - Assigned to: ${task.assignee}`;
        if (task.dueDate) markdown += ` - Due: ${task.dueDate}`;
        markdown += `\n`;
        markdown += `  ${task.description}\n\n`;
      }
    }
  }
  
  return markdown;
}

function generateTimelineView(tasks: Task[], timeline?: ProjectData['timeline']): string {
  let markdown = "";
  
  if (timeline && timeline.phases) {
    for (const phase of timeline.phases) {
      markdown += `### Phase: ${phase.name}\n`;
      markdown += `**Duration:** ${phase.duration}\n\n`;
      
      const phaseTasks = tasks.filter(task => 
        phase.tasks.includes(task.title)
      );
      
      if (phaseTasks.length > 0) {
        for (const task of phaseTasks) {
          markdown += `#### ${task.title}\n`;
          markdown += `${task.description}\n\n`;
          markdown += `- **Type:** ${task.type}\n`;
          markdown += `- **Priority:** ${task.priority}\n`;
          markdown += `- **Status:** ${task.status}\n`;
          
          if (task.assignee) {
            markdown += `- **Assignee:** ${task.assignee}\n`;
          }
          
          if (task.dueDate) {
            markdown += `- **Due Date:** ${task.dueDate}\n`;
          }
          
          markdown += `\n`;
        }
      }
    }
  } else {
    // Fallback: organize by due date
    const tasksWithDates = tasks.filter(task => task.dueDate);
    const tasksWithoutDates = tasks.filter(task => !task.dueDate);
    
    // Sort by due date
    tasksWithDates.sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    
    if (tasksWithDates.length > 0) {
      markdown += `### Tasks with Due Dates\n\n`;
      for (const task of tasksWithDates) {
        markdown += `- **${task.dueDate}** - ${task.title} (${task.type}, ${task.priority})\n`;
      }
      markdown += `\n`;
    }
    
    if (tasksWithoutDates.length > 0) {
      markdown += `### Tasks without Due Dates\n\n`;
      for (const task of tasksWithoutDates) {
        markdown += `- ${task.title} (${task.type}, ${task.priority})\n`;
      }
      markdown += `\n`;
    }
  }
  
  return markdown;
}

function generateTaskTable(tasks: Task[]): string {
  let markdown = "";
  
  markdown += `| Task | Type | Priority | Status | Assignee | Due Date |\n`;
  markdown += `|------|------|----------|--------|----------|----------|\n`;
  
  for (const task of tasks) {
    markdown += `| ${task.title} | ${task.type} | ${task.priority} | ${task.status} | ${task.assignee || 'Unassigned'} | ${task.dueDate || 'No due date'} |\n`;
  }
  
  markdown += `\n`;
  return markdown;
}

function generateStats(tasks: Task[]): {
  totalTasks: number;
  tasksByType: Record<string, number>;
  tasksByPriority: Record<string, number>;
  tasksByStatus: Record<string, number>;
} {
  const stats = {
    totalTasks: tasks.length,
    tasksByType: {} as Record<string, number>,
    tasksByPriority: {} as Record<string, number>,
    tasksByStatus: {} as Record<string, number>,
  };
  
  for (const task of tasks) {
    // Count by type
    stats.tasksByType[task.type] = (stats.tasksByType[task.type] || 0) + 1;
    
    // Count by priority
    stats.tasksByPriority[task.priority] = (stats.tasksByPriority[task.priority] || 0) + 1;
    
    // Count by status
    stats.tasksByStatus[task.status] = (stats.tasksByStatus[task.status] || 0) + 1;
  }
  
  return stats;
}