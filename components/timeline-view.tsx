"use client"

import { useState, useMemo, useRef, useCallback, useEffect } from "react"
import { addMonths, addDays, startOfMonth, startOfDay, endOfMonth, differenceInDays, format, getDate, startOfYear, addYears, endOfYear } from "date-fns"
import { ko } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, ChevronLeft, CalendarDays, Plus, Trash2, Calendar as CalendarIcon, X, Save, RotateCcw, Check, Pencil, Copy, Clipboard } from "lucide-react"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { createClient } from '@supabase/supabase-js'

// 아까 만든 supabase.ts 파일을 불러옵니다.
import { supabase } from "@/lib/supabase"

function InlineDatePicker({
  date,
  onSelect,
  isEditing,
  className,
  defaultMonth
}: {
  date: Date,
  onSelect: (date: Date) => void,
  isEditing: boolean,
  className?: string,
  defaultMonth?: Date
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={!isEditing}>
        <button className={cn("transition-colors shrink-0", isEditing ? "hover:text-foreground text-foreground/80" : "cursor-default text-foreground font-bold", className)}>
          {format(date, "yy.MM.dd")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => { if (d) { onSelect(d); setOpen(false); } }}
          initialFocus
          defaultMonth={defaultMonth || date}
        />
      </PopoverContent>
    </Popover>
  )
}

type Status = "To Do" | "In Progress" | "Done"

const SCALE_OPTIONS = [
  { value: 1, label: "1달" },
  { value: 3, label: "3달" },
  { value: 6, label: "6개월" },
  { value: 9, label: "9개월" },
  { value: 12, label: "1년" },
  { value: 15.6, label: "1.3년" },
] as const
type ScaleMonths = (typeof SCALE_OPTIONS)[number]["value"]

interface Schedule {
  id: string
  startDate: Date
  endDate: Date
  memo?: string
  color?: string
}

interface Task {
  id: string
  name: string
  status: Status
  schedules: Schedule[]
  type: 'inspection' | 'maintenance'
  color?: string
  children?: Task[]
  isExpanded?: boolean
}

interface TaskGroup {
  id: string
  name: string
  tasks: Task[]
}

interface Sheet {
  id: string
  name: string
  groups: TaskGroup[]
}

const BAR_COLORS = [
  { name: 'Blue', value: '#3b82f6', bg: 'bg-blue-500', ring: 'ring-blue-300' },
  { name: 'Green', value: '#22c55e', bg: 'bg-green-500', ring: 'ring-green-300' },
  { name: 'Red', value: '#ef4444', bg: 'bg-red-500', ring: 'ring-red-300' },
  { name: 'Orange', value: '#f97316', bg: 'bg-orange-500', ring: 'ring-orange-300' },
  { name: 'Purple', value: '#a855f7', bg: 'bg-purple-500', ring: 'ring-purple-300' },
  { name: 'Pink', value: '#ec4899', bg: 'bg-pink-500', ring: 'ring-pink-300' },
  { name: 'Teal', value: '#14b8a6', bg: 'bg-teal-500', ring: 'ring-teal-300' },
  { name: 'Yellow', value: '#eab308', bg: 'bg-yellow-500', ring: 'ring-yellow-300' },
  { name: 'Slate', value: '#64748b', bg: 'bg-slate-500', ring: 'ring-slate-300' },
  { name: 'Indigo', value: '#6366f1', bg: 'bg-indigo-500', ring: 'ring-indigo-300' },
  { name: 'Violet', value: '#8b5cf6', bg: 'bg-violet-500', ring: 'ring-violet-300' },
  { name: 'Cyan', value: '#06b6d4', bg: 'bg-cyan-500', ring: 'ring-cyan-300' },
  { name: 'Sky', value: '#0ea5e9', bg: 'bg-sky-500', ring: 'ring-sky-300' },
  { name: 'Emerald', value: '#10b981', bg: 'bg-emerald-500', ring: 'ring-emerald-300' },
  { name: 'Lime', value: '#84cc16', bg: 'bg-lime-500', ring: 'ring-lime-300' },
  { name: 'Amber', value: '#f59e0b', bg: 'bg-amber-500', ring: 'ring-amber-300' },
  { name: 'Deep Orange', value: '#ff5722', bg: 'bg-orange-700', ring: 'ring-orange-500' },
  { name: 'Brown', value: '#795548', bg: 'bg-stone-600', ring: 'ring-stone-400' },
  { name: 'Crimson', value: '#dc143c', bg: 'bg-rose-600', ring: 'ring-rose-400' },
  { name: 'Olive', value: '#808000', bg: 'bg-lime-700', ring: 'ring-lime-500' },
]

const DEFAULT_BAR_COLOR = '#3b82f6'

interface FlatTask {
  task: Task
  depth: number
}

// Helper to flatten tasks for the timeline view (with depth info)
const flattenTasksWithDepth = (tasks: Task[], depth = 0): FlatTask[] => {
  let result: FlatTask[] = []
  tasks.forEach((task) => {
    result.push({ task, depth })
    if (task.isExpanded && task.children) {
      result = result.concat(flattenTasksWithDepth(task.children, depth + 1))
    }
  })
  return result
}

const SIDEBAR_WIDTH = 320 // px
const SIDEBAR_COLLAPSED_WIDTH = 48 // px
const ROW_HEIGHT = 40 // px

const PASSWORD_STORAGE_KEY = "timeline-password"

// Serialize tasks to JSON-safe format (Date -> string)
function serializeTasks(tasks: Task[]): any[] {
  return tasks.map((t) => ({
    ...t,
    schedules: t.schedules.map(s => ({
      ...s,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate.toISOString()
    })),
    children: t.children ? serializeTasks(t.children) : undefined
  }))
}

// Serialize groups to JSON-safe format
const serializeGroups = (groups: TaskGroup[]): any[] => {
  return groups.map(g => ({
    ...g,
    tasks: serializeTasks(g.tasks)
  }))
}

// Serialize sheets to JSON-safe format
function serializeSheets(sheets: Sheet[]): any[] {
  return sheets.map(s => ({
    ...s,
    groups: serializeGroups(s.groups)
  }))
}

// Deserialize tasks from JSON (string -> Date)
function deserializeTasks(data: any[]): Task[] {
  return data.map((t) => ({
    ...t,
    schedules: t.schedules.map((s: any) => ({
      ...s,
      startDate: new Date(s.startDate),
      endDate: new Date(s.endDate),
    })),
    children: t.children ? deserializeTasks(t.children) : undefined
  }))
}

// Deserialize groups from JSON
const deserializeGroups = (data: any[]): TaskGroup[] => {
  return data.map(g => ({
    ...g,
    tasks: deserializeTasks(g.tasks || [])
  }))
}

// Deserialize sheets from JSON
function deserializeSheets(data: any[]): Sheet[] {
  return data.map(s => {
    if ((s as any).tasks && !s.groups) {
      return {
        id: s.id,
        name: s.name,
        groups: [{
          id: 'default-group',
          name: 'Tasks',
          tasks: deserializeTasks((s as any).tasks)
        }]
      }
    }
    return {
      ...s,
      groups: deserializeGroups(s.groups || [])
    }
  })
}

export function TimelineView() {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [currentSheetId, setCurrentSheetId] = useState<string>("default")
  const [isLoading, setIsLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [appPassword, setAppPassword] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(PASSWORD_STORAGE_KEY) || "1"
    }
    return "1"
  })

  // Server time offset (serverTime - Date.now())
  const [timeOffset, setTimeOffset] = useState(0)

  // Fetch server time on mount to calculate offset
  useEffect(() => {
    async function syncTime() {
      try {
        // Using worldtimeapi.org to get external reference time (Asia/Seoul)
        const response = await fetch("https://worldtimeapi.org/api/timezone/Asia/Seoul")
        if (response.ok) {
          const data = await response.json()
          const serverDate = new Date(data.datetime)
          const offset = serverDate.getTime() - Date.now()
          console.log("🚀 [DEBUG] Server time synced. Offset:", offset, "ms")
          setTimeOffset(offset)
        }
      } catch (err) {
        console.error("🚀 [DEBUG] Server time sync failed, falling back to local time:", err)
      }
    }
    syncTime()
  }, [])

  // Helper to get the corrected "now" date based on offset
  const getCorrectedNow = useCallback(() => new Date(Date.now() + timeOffset), [timeOffset])

  // Auto-save whenever sheets or currentSheetId changes
  useEffect(() => {
    if (isLoading || sheets.length === 0) return

    const saveData = async () => {
      setSaveStatus('saving')
      try {
        const { error } = await supabase
          .from('timeline_sheets')
          .update({
            data: {
              sheets: serializeSheets(sheets),
              currentId: currentSheetId,
              appPassword: appPassword
            },
            updated_at: getCorrectedNow().toISOString()
          })
          .eq('name', 'Sheet 1')

        if (error) {
          console.error("Auto-save error:", error)
        } else {
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        }
      } catch (err) {
        console.error("Auto-save exception:", err)
      }
    }

    const timeoutId = setTimeout(saveData, 2000) // 2 second debounce
    return () => clearTimeout(timeoutId)
  }, [sheets, currentSheetId, appPassword, isLoading])

  // Color palette for folder tabs
  const TAB_COLORS = [
    { bg: "bg-amber-100", border: "border-amber-200", active: "bg-amber-50" },
    { bg: "bg-blue-100", border: "border-blue-200", active: "bg-blue-50" },
    { bg: "bg-emerald-100", border: "border-emerald-200", active: "bg-emerald-50" },
    { bg: "bg-orange-100", border: "border-orange-200", active: "bg-orange-50" },
    { bg: "bg-purple-100", border: "border-purple-200", active: "bg-purple-50" },
    { bg: "bg-rose-100", border: "border-rose-200", active: "bg-rose-50" },
  ]

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [expandedSchedules, setExpandedSchedules] = useState<Record<string, boolean>>({})

  // Reset expansion state when switching tabs
  useEffect(() => {
    setExpandedSchedules({})
  }, [currentSheetId])

  const [hoverPosition, setHoverPosition] = useState<{ percent: number; date: Date } | null>(null)
  const [clipboardTask, setClipboardTask] = useState<Task | null>(null)
  const [clipboardSheet, setClipboardSheet] = useState<Sheet | null>(null)
  const [showSheetCopied, setShowSheetCopied] = useState(false)

  // 1. Supabase에서 데이터 불러오기 (초기 마운트 시 1회)
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      try {
        const { data, error } = await supabase.from('timeline_sheets').select('*').eq('name', 'Sheet 1').single()

        if (error) {
          console.error("데이터 불러오기 오류:", error.message)
          setSheets([{
            id: "default",
            name: "Sheet 1",
            groups: [{ id: 'default-group', name: 'Tasks', tasks: [] }]
          }])
        } else if (data && data.data) {
          const rawData = data.data
          console.log("🚀 [DEBUG] Received rawData:", rawData)

          if (rawData.sheets && Array.isArray(rawData.sheets) && rawData.sheets.length > 0) {
            console.log("🚀 [DEBUG] Loading multiple sheets")
            setSheets(deserializeSheets(rawData.sheets))
          } else if (rawData.groups || rawData.items) {
            console.log("🚀 [DEBUG] Loading single sheet from groups/items")
            setSheets([{
              id: "default",
              name: "Sheet 1",
              groups: deserializeGroups(rawData.groups || [])
            }])
          }

          setCurrentSheetId(rawData.currentId || "default")

          // 데이터베이스에 저장된 비밀번호가 있으면 불러옴
          if (rawData.appPassword) {
            console.log("🚀 [DEBUG] Loading password from DB")
            setAppPassword(rawData.appPassword)
            localStorage.setItem(PASSWORD_STORAGE_KEY, rawData.appPassword)
          }
        }
      } catch (err) {
        console.error("loadData 과정에서 예외 발생:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])



  const toggleScheduleVisibility = (taskId: string) => {
    setExpandedSchedules(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }))
  }

  const currentSheet = useMemo(() =>
    sheets.find(s => s.id === currentSheetId) || sheets[0]
    , [sheets, currentSheetId])

  const activeSheetIndex = sheets.findIndex(s => s.id === currentSheetId)
  const activeTabColor = TAB_COLORS[(activeSheetIndex === -1 ? 0 : activeSheetIndex) % TAB_COLORS.length]

  const setGroupTasks = (groupId: string, newTasks: Task[] | ((prev: Task[]) => Task[])) => {
    setSheets(prev => prev.map(s => {
      if (s.id === currentSheetId) {
        return {
          ...s,
          groups: s.groups.map(g => {
            if (g.id === groupId) {
              return {
                ...g,
                tasks: typeof newTasks === 'function' ? newTasks(g.tasks) : newTasks
              }
            }
            return g
          })
        }
      }
      return s
    }))
  }

  const updateTaskInGroup = (groupId: string, taskId: string, updateFn: (task: Task) => Task) => {
    const updateRecursive = (items: Task[]): Task[] => {
      return items.map((t) => {
        if (t.id === taskId) return updateFn(t)
        if (t.children) return { ...t, children: updateRecursive(t.children) }
        return t
      })
    }
    setGroupTasks(groupId, (tasks) => updateRecursive(tasks))
  }

  const cloneTaskWithNewIds = (task: Task): Task => {
    return {
      ...task,
      id: Math.random().toString(36).substr(2, 9),
      schedules: task.schedules.map(s => ({
        ...s,
        id: Math.random().toString(36).substr(2, 9),
        startDate: new Date(s.startDate),
        endDate: new Date(s.endDate)
      })),
      children: task.children ? task.children.map(cloneTaskWithNewIds) : []
    }
  }

  const cloneGroupWithNewIds = (group: TaskGroup): TaskGroup => ({
    ...group,
    id: Math.random().toString(36).substr(2, 9),
    tasks: group.tasks.map(cloneTaskWithNewIds)
  })

  const cloneSheetWithNewIds = (sheet: Sheet): Sheet => ({
    ...sheet,
    id: Math.random().toString(36).substr(2, 9),
    name: `${sheet.name} (복사)`,
    groups: sheet.groups.map(cloneGroupWithNewIds)
  })

  const copyTask = (task: Task) => {
    // Deep copy to clipboard
    setClipboardTask(JSON.parse(JSON.stringify(task)))
  }

  const pasteTaskIntoGroup = (groupId: string) => {
    if (!clipboardTask) return
    const newTask = cloneTaskWithNewIds(clipboardTask)
    setGroupTasks(groupId, (tasks) => [...tasks, newTask])
  }

  const pasteTaskAsSubtask = (groupId: string, parentId: string) => {
    if (!clipboardTask) return
    const newTask = cloneTaskWithNewIds(clipboardTask)
    updateTaskInGroup(groupId, parentId, (t) => ({
      ...t,
      isExpanded: true,
      children: [...(t.children || []), newTask]
    }))
  }

  const copyCurrentSheet = () => {
    if (!currentSheet) return
    setClipboardSheet(JSON.parse(JSON.stringify(currentSheet)))
    setShowSheetCopied(true)
    setTimeout(() => setShowSheetCopied(false), 2000)
  }

  const pasteSheet = () => {
    if (!clipboardSheet) return
    const newSheet = cloneSheetWithNewIds(clipboardSheet)
    setSheets(prev => [...prev, newSheet])
    setCurrentSheetId(newSheet.id)
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)

  const handleEditToggle = async () => {
    console.log("🚀 [DEBUG] 1. handleEditToggle 진입. isEditing:", isEditing)

    if (isEditing) {
      setSaveStatus('saving')
      console.log("🚀 [DEBUG] 2. 저장 프로세스 시작 (isEditing=true)")

      try {
        console.log("🚀 [DEBUG] 3. 데이터 직렬화 시도 중...")
        const currentGroups = currentSheet?.groups || []

        const saveDataToUpsert = {
          items: [],
          groups: serializeGroups(currentGroups),
          sheets: serializeSheets(sheets),
          currentId: currentSheetId,
          appPassword: appPassword // 비밀번호도 데이터베이스에 함께 저장
        };
        console.log("🚀 [DEBUG] 4. 직렬화 완료. 데이터 크기(groups):", saveDataToUpsert.groups.length)

        console.log("🚀 [DEBUG] 5. Supabase 'timeline_sheets' upsert 요청 중...")
        const { data: upsertData, error } = await supabase
          .from('timeline_sheets')
          .upsert({
            name: 'Sheet 1',
            data: saveDataToUpsert,
            updated_at: getCorrectedNow().toISOString()
          }, { onConflict: 'name' })
          .select()

        if (error) {
          console.error("🚀 [DEBUG] 6-Err. Supabase 오류 발생:", error)
          alert("❌ 저장 실패 (Supabase): " + error.message)
        } else {
          console.log("🚀 [DEBUG] 6-Success. 저장 완료!", upsertData)
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
          setIsEditing(false)
          alert("✅ [Ver 5.0] 비밀번호 포함 모든 데이터가 동기화되었습니다!")
        }
      } catch (err: any) {
        console.error("🚀 [DEBUG] 6-Crit. 예상치 못한 예외 발생:", err)
        alert("🚨 저장 중 치명적 오류 발생: " + (err.message || "알 수 없는 오류"))
      } finally {
        setSaveStatus('idle')
        console.log("🚀 [DEBUG] 7. handleEditToggle 완료 (finally)")
      }
    } else {
      console.log("🚀 [DEBUG] 2. 비밀번호 입력 모드 진입")
      const input = prompt("비밀번호 4자리를 입력하세요:")
      if (input === appPassword) {
        console.log("🚀 [DEBUG] 3. 비밀번호 일치 -> 수정 모드 활성화")
        setIsEditing(true)
      } else if (input !== null) {
        console.log("🚀 [DEBUG] 3. 비밀번호 불일치")
        alert("비밀번호가 틀렸습니다.")
      } else {
        console.log("🚀 [DEBUG] 3. 비밀번호 입력 취소")
      }
    }
  }

  const handleChangePassword = () => {
    const newPassword = prompt("새 비밀번호를 입력하세요:")
    if (newPassword !== null) {
      if (newPassword.trim() === "") {
        alert("비밀번호는 빈칸일 수 없습니다.")
        return
      }
      setAppPassword(newPassword)
      localStorage.setItem(PASSWORD_STORAGE_KEY, newPassword)
      alert("비밀번호가 변경되었습니다.")
    }
  }


  // Drag and Drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)

  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null)
  const [dragOverScheduleId, setDragOverScheduleId] = useState<string | null>(null)

  const [draggedSheetId, setDraggedSheetId] = useState<string | null>(null)
  const [dragOverSheetId, setDragOverSheetId] = useState<string | null>(null)

  // Group management
  const addGroup = () => {
    setSheets(prev => prev.map(s => {
      if (s.id === currentSheetId) {
        return {
          ...s,
          groups: [
            ...s.groups,
            { id: Math.random().toString(36).substr(2, 9), name: 'New Group', tasks: [] }
          ]
        }
      }
      return s
    }))
  }

  const deleteGroup = (groupId: string) => {
    if (currentSheet.groups.length <= 1) {
      alert("최소한 하나의 그룹은 있어야 합니다.")
      return
    }
    if (confirm("그룹을 삭제하시겠습니까?")) {
      setSheets(prev => prev.map(s => {
        if (s.id === currentSheetId) {
          return {
            ...s,
            groups: s.groups.filter(g => g.id !== groupId)
          }
        }
        return s
      }))
    }
  }

  const updateGroupName = (groupId: string, name: string) => {
    setSheets(prev => prev.map(s => {
      if (s.id === currentSheetId) {
        return {
          ...s,
          groups: s.groups.map(g => g.id === groupId ? { ...g, name } : g)
        }
      }
      return s
    }))
  }

  // Refactored Task actions to be group-aware
  const updateTaskName = (groupId: string, taskId: string, newName: string) => {
    updateTaskInGroup(groupId, taskId, (t) => ({ ...t, name: newName }))
  }

  const updateScheduleDate = (groupId: string, taskId: string, scheduleId: string, field: 'startDate' | 'endDate', newDate: Date) => {
    updateTaskInGroup(groupId, taskId, (t) => ({
      ...t,
      schedules: t.schedules.map(s => s.id === scheduleId ? { ...s, [field]: newDate } : s)
    }))
  }

  const updateTaskType = (groupId: string, taskId: string, newType: 'inspection' | 'maintenance') => {
    updateTaskInGroup(groupId, taskId, (t) => ({ ...t, type: newType }))
  }

  const updateTaskColor = (groupId: string, taskId: string, color: string) => {
    updateTaskInGroup(groupId, taskId, (t) => ({ ...t, color }))
  }

  const updateScheduleMemo = (groupId: string, taskId: string, scheduleId: string, memo: string) => {
    updateTaskInGroup(groupId, taskId, (t) => ({
      ...t,
      schedules: t.schedules.map(s => s.id === scheduleId ? { ...s, memo: memo.slice(0, 40) } : s)
    }))
  }

  const updateScheduleColor = (groupId: string, taskId: string, scheduleId: string, color: string) => {
    updateTaskInGroup(groupId, taskId, (t) => ({
      ...t,
      schedules: t.schedules.map(s => s.id === scheduleId ? { ...s, color } : s)
    }))
  }

  const addSchedule = (groupId: string, taskId: string) => {
    updateTaskInGroup(groupId, taskId, (t) => ({
      ...t,
      schedules: [
        ...t.schedules,
        { id: Math.random().toString(36).substr(2, 9), startDate: getCorrectedNow(), endDate: addMonths(getCorrectedNow(), 1) }
      ]
    }))
  }

  const deleteSchedule = (groupId: string, taskId: string, scheduleId: string) => {
    updateTaskInGroup(groupId, taskId, (t) => ({
      ...t,
      schedules: t.schedules.filter(s => s.id !== scheduleId)
    }))
  }

  const addTask = (groupId: string, parentId: string | null = null) => {
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      name: "New Task",
      status: "To Do",
      schedules: [{ id: Math.random().toString(36).substr(2, 9), startDate: getCorrectedNow(), endDate: addMonths(getCorrectedNow(), 1) }],
      type: 'inspection',
      children: [],
      isExpanded: true
    }

    if (!parentId) {
      setGroupTasks(groupId, (tasks) => [...tasks, newTask])
      setEditingId(newTask.id)
    } else {
      updateTaskInGroup(groupId, parentId, (t) => ({
        ...t,
        isExpanded: true,
        children: [...(t.children || []), newTask]
      }))
      setEditingId(newTask.id)
    }
  }

  const deleteTask = (groupId: string, taskId: string) => {
    const deleteRecursive = (items: Task[]): Task[] => {
      return items
        .filter(t => t.id !== taskId)
        .map(t => ({
          ...t,
          children: t.children ? deleteRecursive(t.children) : []
        }))
    }
    setGroupTasks(groupId, (tasks) => deleteRecursive(tasks))
  }

  const toggleExpand = (groupId: string, taskId: string) => {
    updateTaskInGroup(groupId, taskId, (t) => ({ ...t, isExpanded: !t.isExpanded }))
  }

  // Sheet management
  const addSheet = () => {
    const newSheet: Sheet = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Sheet ${sheets.length + 1}`,
      groups: [{ id: 'default-group', name: 'Tasks', tasks: [] }]
    }
    setSheets([...sheets, newSheet])
    setCurrentSheetId(newSheet.id)
  }

  const deleteSheet = (id: string) => {
    if (sheets.length <= 1) {
      alert("최소한 하나의 시트는 있어야 합니다.")
      return
    }
    if (confirm("시트를 삭제하시겠습니까?")) {
      const newSheets = sheets.filter(s => s.id !== id)
      setSheets(newSheets)
      if (currentSheetId === id) {
        setCurrentSheetId(newSheets[0].id)
      }
    }
  }

  const updateSheetName = (id: string, name: string) => {
    setSheets(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  }

  const moveSheet = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    setSheets(prev => {
      const newSheets = [...prev]
      const sourceIndex = newSheets.findIndex(s => s.id === sourceId)
      const targetIndex = newSheets.findIndex(s => s.id === targetId)
      if (sourceIndex > -1 && targetIndex > -1) {
        const [removed] = newSheets.splice(sourceIndex, 1)
        newSheets.splice(targetIndex, 0, removed)
      }
      return newSheets
    })
  }

  // Move task (Drag and Drop) - Within group
  const moveTask = (groupId: string, sourceId: string, targetId: string) => {
    if (sourceId === targetId) return

    setGroupTasks(groupId, (prevTasks) => {
      let sourceTask: Task | null = null

      // 1. Find and remove the source task
      const removeTask = (items: Task[]): Task[] => {
        const index = items.findIndex(t => t.id === sourceId)
        if (index > -1) {
          sourceTask = items[index]
          const newItems = [...items]
          newItems.splice(index, 1)
          return newItems
        }
        return items.map(t => {
          if (t.children) {
            return { ...t, children: removeTask(t.children) }
          }
          return t
        })
      }

      let newTasks = removeTask(prevTasks)

      // If we couldn't find it, abort
      if (!sourceTask) return prevTasks

      // 2. Find target and insert BEFORE it
      let inserted = false
      const insertTask = (items: Task[]): Task[] => {
        if (inserted) return items
        const index = items.findIndex(t => t.id === targetId)
        if (index > -1) {
          const newArray = [...items]
          newArray.splice(index, 0, sourceTask!)
          inserted = true
          return newArray
        }
        return items.map(t => {
          if (t.children) {
            return { ...t, children: insertTask(t.children) }
          }
          return t
        })
      }

      newTasks = insertTask(newTasks)

      // If target wasn't found (e.g. edge cases), just append to root
      if (!inserted) {
        newTasks.push(sourceTask)
      }

      return newTasks
    })
  }

  // Move schedule within a task (Drag and Drop)
  const moveSchedule = (groupId: string, taskId: string, sourceScheduleId: string, targetScheduleId: string) => {
    if (sourceScheduleId === targetScheduleId) return

    updateTaskInGroup(groupId, taskId, (t) => {
      const indexSource = t.schedules.findIndex(s => s.id === sourceScheduleId)
      const indexTarget = t.schedules.findIndex(s => s.id === targetScheduleId)

      if (indexSource > -1 && indexTarget > -1) {
        const newSchedules = [...t.schedules]
        const [sourceSchedule] = newSchedules.splice(indexSource, 1)
        newSchedules.splice(indexTarget, 0, sourceSchedule)
        return { ...t, schedules: newSchedules }
      }
      return t
    })
  }

  const [scaleMonths, setScaleMonths] = useState<ScaleMonths>(12)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Configuration for the full scrollable range
  const timelineConfig = useMemo(() => {
    const today = getCorrectedNow()
    // Fixed range: -2 years to +6 years (8 years total, covers until 2031)
    const startDate = startOfYear(addYears(today, -2))
    const totalMonths = 96
    const endDate = addMonths(startDate, totalMonths)

    // Calculate total width ratio: (Total Months / scaleMonths) * 100%
    const widthPercent = (totalMonths / scaleMonths) * 100

    const periods: { label: string; date: Date; type: 'day' | 'month'; showLabel?: boolean }[] = []
    const subHeaders: { label: string; widthPercent: number; leftPercent: number }[] = []

    // Generate ticks based on zoom level (scaleMonths)
    if (scaleMonths <= 6) {
      // High zoom: Show days for the entire range, grouped by month
      const totalDays = differenceInDays(endDate, startDate)

      // Generate Day Ticks
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(startDate, i)
        const day = getDate(d)

        // Show all labels for very high zoom (1-2 months)
        // Show sparse labels for 3-4 months (e.g., 1, 5, 10...)
        const showLabel = scaleMonths <= 2 ? true : (day === 1 || day % 5 === 0)

        periods.push({
          label: `${day}`,
          date: d,
          type: 'day',
          showLabel
        })
      }

      // Generate Month Group Headers
      let currentMonthStart = startDate
      const totalMs = endDate.getTime() - startDate.getTime()

      while (currentMonthStart < endDate) {
        const currentMonthEnd = endOfMonth(currentMonthStart)
        // Clip end date if it exceeds timeline range
        const actualEnd = currentMonthEnd > endDate ? endDate : currentMonthEnd

        // Use precise ms for width and offset
        const startMsOffset = currentMonthStart.getTime() - startDate.getTime()
        const actualEndInclusive = addDays(actualEnd, 1).getTime() // To match exact day boundaries
        const msInMonth = actualEndInclusive - currentMonthStart.getTime()

        const leftPercent = (startMsOffset / totalMs) * 100
        const widthPercent = (msInMonth / totalMs) * 100

        subHeaders.push({
          label: format(currentMonthStart, "yyyy. MM"),
          widthPercent,
          leftPercent
        })

        currentMonthStart = addDays(currentMonthEnd, 1)
      }

    } else {
      // Low zoom: Split Header (Years on Top, Months on Bottom)

      // 1. Generate Year Group Headers
      let currentYearStart = startDate
      const totalMs = endDate.getTime() - startDate.getTime()

      while (currentYearStart < endDate) {
        const currentYearEnd = new Date(currentYearStart.getFullYear(), 11, 31) // End of Year
        // Clip end date if it exceeds timeline range
        const actualEnd = currentYearEnd > endDate ? endDate : currentYearEnd

        const startMsOffset = currentYearStart.getTime() - startDate.getTime()
        const actualEndInclusive = addDays(actualEnd, 1).getTime() // Match exact day boundaries
        const msInYear = actualEndInclusive - currentYearStart.getTime()

        const leftPercent = (startMsOffset / totalMs) * 100
        const widthPercent = (msInYear / totalMs) * 100

        subHeaders.push({
          label: format(currentYearStart, "yyyy"),
          widthPercent,
          leftPercent
        })

        currentYearStart = addDays(currentYearEnd, 1)
      }

      // 2. Generate Month Ticks
      for (let i = 0; i < totalMonths; i++) {
        const d = addMonths(startDate, i)
        periods.push({
          label: format(d, "MM"),
          date: d,
          type: 'month',
          showLabel: true
        })
      }
    }

    // 4. Generate Year Ticks (Explicitly for Jan 1st)
    const yearLabels: { label: string; leftPercent: number; isExactStart: boolean }[] = []

    // Use getTime() exclusively to perfectly match calculateSchedulePosition Math
    const startMs = startDate.getTime()
    const endMs = endDate.getTime()
    const totalMs = endMs - startMs

    // First label (always at the start of timeline)
    yearLabels.push({
      label: format(startDate, "yyyy"),
      leftPercent: 0,
      isExactStart: differenceInDays(startDate, startOfYear(startDate)) === 0
    })

    // Subsequent 1st Jan ticks
    let yearRunner = startOfYear(addYears(startDate, 1))
    while (yearRunner <= endDate) {
      const runnerMs = yearRunner.getTime()
      const leftPercent = ((runnerMs - startMs) / totalMs) * 100
      yearLabels.push({
        label: format(yearRunner, "yyyy"),
        leftPercent,
        isExactStart: true
      })
      yearRunner = addYears(yearRunner, 1)
    }

    // 5. Generate Month Labels (Simple format)
    const monthLabels: { label: string; leftPercent: number; isExactStart: boolean }[] = []
    let monthRunner = startOfMonth(startDate)
    while (monthRunner <= endDate) {
      if (monthRunner >= startDate) {
        const runnerMs = monthRunner.getTime()
        const leftPercent = ((runnerMs - startMs) / totalMs) * 100
        // Don't draw month label exactly at the same place as Year label if it overlaps too much, 
        // but since they have different design, it's fine.
        monthLabels.push({
          label: format(monthRunner, "M"),
          leftPercent,
          isExactStart: true
        })
      }
      monthRunner = addMonths(monthRunner, 1)
    }

    return { periods, subHeaders, yearLabels, monthLabels, startOfYear: startDate, endOfYear: endDate, widthPercent, totalMonths }
  }, [scaleMonths])

  const calculateSchedulePosition = (schedule: Schedule) => {
    const { startOfYear, endOfYear } = timelineConfig
    const totalDuration = endOfYear.getTime() - startOfYear.getTime()

    const taskStart = schedule.startDate.getTime() - startOfYear.getTime()
    const taskEnd = schedule.endDate.getTime() - startOfYear.getTime()

    const left = (taskStart / totalDuration) * 100
    // Minimum width of 0.04% for ultra-thin but visible single-day tasks
    const width = Math.max(0.04, ((taskEnd - taskStart) / totalDuration) * 100)

    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.max(0, width)}%`,
      leftPercent: Math.max(0, left),
      endPercent: Math.max(0, left + width),
    }
  }

  const todayPositionPercent = useMemo(() => {
    const today = startOfDay(getCorrectedNow())
    const { startOfYear, endOfYear } = timelineConfig
    if (today < startOfYear || today >= endOfYear) return null
    const totalDuration = endOfYear.getTime() - startOfYear.getTime()
    const currentDuration = today.getTime() - startOfYear.getTime()
    return (currentDuration / totalDuration) * 100
  }, [timelineConfig])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const innerContainer = e.currentTarget.querySelector('.timeline-inner-container')
    if (!innerContainer) return
    const rect = innerContainer.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = (x / rect.width) * 100

    const { startOfYear, endOfYear } = timelineConfig
    const totalDuration = endOfYear.getTime() - startOfYear.getTime()
    const hoverTime = startOfYear.getTime() + (totalDuration * (percent / 100))
    let hoverDate = new Date(hoverTime)

    // Snap to nearest local midnight if within 4 pixels of the boundary to fix precision issues
    const pxToMs = totalDuration / rect.width
    const snapMs = 4 * pxToMs
    const hoverStartOfDay = startOfDay(hoverDate)
    const msSinceStart = hoverDate.getTime() - hoverStartOfDay.getTime()
    const msInDay = 24 * 60 * 60 * 1000

    if (msSinceStart < snapMs) {
      hoverDate = hoverStartOfDay
    } else if (msInDay - msSinceStart < snapMs) {
      hoverDate = addDays(hoverStartOfDay, 1)
    }

    // Only set hover if within timeline bounds (after sidebar)
    if (x >= 0 && x <= rect.width) {
      setHoverPosition({ percent, date: hoverDate })
    } else {
      setHoverPosition(null)
    }
  }, [timelineConfig])

  const handleMouseLeave = useCallback(() => {
    setHoverPosition(null)
  }, [])

  const scrollToToday = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el || todayPositionPercent == null) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return

    // Center today at 30% of the viewport width from the left
    const contentWidth = el.scrollWidth
    const viewportWidth = el.clientWidth
    const targetScroll = (todayPositionPercent / 100) * contentWidth - viewportWidth * 0.3

    el.scrollTo({ left: Math.max(0, Math.min(targetScroll, maxScroll)), behavior: "smooth" })
  }, [todayPositionPercent])

  // Attempt to scroll today into view after data loading is complete
  useEffect(() => {
    if (!isLoading) {
      const t = setTimeout(scrollToToday, 500) // Give UI time to render after loading
      return () => clearTimeout(t)
    }
  }, [isLoading, scrollToToday])

  // Whenever time scale changes, attempt to smoothly scroll today into view again
  useEffect(() => {
    const t = setTimeout(scrollToToday, 100)
    return () => clearTimeout(t)
  }, [scaleMonths, scrollToToday])

  const sidebarW = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH

  if (isLoading) return <div className="flex h-screen items-center justify-center font-bold text-lg">데이터베이스와 동기화 중입니다...</div>

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-1.5">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-foreground" />
          <h1 className="text-lg font-semibold text-foreground">Timeline View (Ver 5.7)</h1>
          <div className="flex items-center gap-1.5 ml-2">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-xs text-amber-500 animate-pulse">
                <Save className="h-3.5 w-3.5" />
                저장 중...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-emerald-500">
                <Check className="h-3.5 w-3.5" />
                저장됨
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Zoom</span>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-1">
            {SCALE_OPTIONS.map(({ value, label }) => (
              <Button key={value} variant={scaleMonths === value ? "default" : "ghost"} size="sm" onClick={() => setScaleMonths(value)} className="h-8 px-2.5 text-xs font-medium">
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleChangePassword}
                className="h-7 shrink-0 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                비밀번호 변경
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={scrollToToday}
              className="h-7 shrink-0 px-2 text-xs font-medium"
            >
              Today
            </Button>
            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              onClick={handleEditToggle}
              className={cn(
                "h-7 shrink-0 px-2 text-xs font-medium transition-all",
                isEditing && "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
              )}
            >
              {isEditing ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  수정완료
                </>
              ) : (
                <>
                  <Pencil className="h-3 w-3 mr-1" />
                  수정
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Sheet Bar (Top - Folder Index Style) */}
      <div className="flex items-end gap-0 border-b border-border bg-slate-50/50 dark:bg-muted/10 px-6 pt-2 overflow-x-auto min-h-[40px]">
        {sheets.map((s, idx) => {
          const color = TAB_COLORS[idx % TAB_COLORS.length]
          const isActive = currentSheetId === s.id

          return (
            <div
              key={s.id}
              draggable={isEditing}
              onDragStart={(e) => {
                if (!isEditing) return
                setDraggedSheetId(s.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (!isEditing) return
                e.preventDefault()
                setDragOverSheetId(s.id)
              }}
              onDragLeave={() => setDragOverSheetId(null)}
              onDrop={(e) => {
                if (!isEditing || !draggedSheetId) return
                e.preventDefault()
                moveSheet(draggedSheetId, s.id)
                setDraggedSheetId(null)
                setDragOverSheetId(null)
              }}
              onDragEnd={() => {
                setDraggedSheetId(null)
                setDragOverSheetId(null)
              }}
              className={cn(
                "group relative flex items-center h-8 min-w-[110px] max-w-[220px] px-6 transition-all cursor-pointer",
                isActive ? "z-10 -mb-[1px] drop-shadow-md" : "opacity-70 hover:opacity-100 hover:z-20",
                draggedSheetId === s.id && "opacity-30",
                dragOverSheetId === s.id && "ring-2 ring-primary/50 ring-offset-1 rounded-t-lg z-30"
              )}
              style={{ marginLeft: idx === 0 ? 0 : '-15px' }}
              onClick={() => !draggedSheetId && setCurrentSheetId(s.id)}
            >
              {/* Trapezoid Background - using pseudo element for the sloped effect */}
              <div
                className={cn(
                  "absolute inset-0 rounded-t-lg border-x border-t transition-colors",
                  isActive ? cn("border-border", color.active, "border-t-2 opacity-100") : cn("border-transparent opacity-80", color.bg)
                )}
                style={{
                  clipPath: 'polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)',
                  transform: isActive ? 'scale(1.05, 1.1)' : 'scale(1)',
                  transformOrigin: 'bottom'
                }}
              />

              {editingSheetId === s.id ? (
                <input
                  autoFocus
                  className="relative z-10 w-full bg-transparent border-none text-sm font-bold h-6 focus:outline-none text-center"
                  defaultValue={s.name}
                  onBlur={(e) => { updateSheetName(s.id, e.target.value); setEditingSheetId(null) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateSheetName(s.id, (e.target as HTMLInputElement).value)
                      setEditingSheetId(null)
                    }
                  }}
                />
              ) : (
                <span
                  className={cn(
                    "relative z-10 font-bold truncate flex-1 text-center transition-all duration-300",
                    isActive ? "text-sm text-foreground" : "text-xs text-muted-foreground"
                  )}
                  onDoubleClick={() => isEditing && setEditingSheetId(s.id)}
                >
                  {s.name}
                </span>
              )}

              {isEditing && (
                <div className="relative z-10 flex items-center transition-all -mr-4 ml-1">
                  {isActive && (
                    <button
                      onClick={(e) => { e.stopPropagation(); copyCurrentSheet() }}
                      className={cn(
                        "p-1 rounded-full transition-all duration-300",
                        showSheetCopied ? "text-emerald-500 scale-125" : "text-muted-foreground hover:text-foreground hover:bg-black/5"
                      )}
                      title="시트 복사"
                    >
                      {showSheetCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                  {sheets.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSheet(s.id) }}
                      className="hover:text-destructive p-1 rounded-full hover:bg-black/5 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {isEditing && (
          <div className="flex items-center gap-2 ml-4 mb-0.5">
            {clipboardSheet && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/50 text-emerald-600 shadow-sm transition-all hover:scale-110 active:scale-95"
                onClick={pasteSheet}
                title="복사한 시트 붙여넣기"
              >
                <Clipboard className="h-6 w-6" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-muted shadow-sm transition-all hover:scale-110 active:scale-95"
              onClick={addSheet}
              title="새 시트 추가"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </div>
        )}
      </div>

      {/* Main Content - Single scroll container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-slate-50/50 dark:bg-background/50"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="relative min-h-full timeline-inner-container"
          style={{ width: `${timelineConfig.widthPercent}%`, minWidth: `calc(${sidebarW}px + 800px)` }}
        >
          {/* Simple Year & Month Header (sticky) - Between Global Header and Tasks */}
          <div className={cn("sticky top-0 z-40 flex h-9 border-b border-border min-w-full pointer-events-none transition-colors duration-300", activeTabColor.active)}>
            {/* Matching Sidebar Width gap with robust masking background to hide scrolling labels */}
            <div className={cn("sticky left-0 z-20 shrink-0 border-r border-border transition-colors duration-300", activeTabColor.active)} style={{ width: `${sidebarW}px`, pointerEvents: 'auto' }} />

            <div className="absolute inset-0 z-10 pointer-events-none">
              {timelineConfig.yearLabels.map((yl, idx) => {
                const isLast = idx === timelineConfig.yearLabels.length - 1;
                const widthPercent = isLast ? 100 - yl.leftPercent : timelineConfig.yearLabels[idx + 1].leftPercent - yl.leftPercent;

                return (
                  <div
                    key={`y-h-${idx}`}
                    className="absolute top-0 bottom-0 flex translate-y-0.5"
                    style={{ left: `${yl.leftPercent}%`, width: `${widthPercent}%` }}
                  >
                    {yl.isExactStart && <div className="absolute left-0 top-0 h-3 border-l-4 border-foreground" />}
                    <div className="sticky flex items-start" style={{ left: `${sidebarW}px` }}>
                      <span className="text-sm font-black text-foreground ml-1.5 leading-none">
                        {yl.label}
                      </span>
                    </div>
                  </div>
                )
              })}

              {timelineConfig.monthLabels.map((ml, idx) => (
                <div
                  key={`m-h-${idx}`}
                  className="absolute bottom-0 flex flex-col justify-end items-start"
                  style={{ left: `${ml.leftPercent}%` }}
                >
                  <span className="absolute bottom-1.5 left-1 text-[11px] font-semibold text-muted-foreground leading-none">
                    {ml.label}
                  </span>
                  <div className="h-2 border-l border-foreground/30" />
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Header (sticky - moved below Year Header) */}
          <div
            className="sticky left-0 top-6 z-30 border-b border-r border-border bg-card"
            style={{ width: `${sidebarW}px` }}
          >
            <div className="flex items-center px-4 py-3">
              {!isCollapsed && (
                <div className="flex flex-1 items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Tasks</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] font-bold gap-1 text-muted-foreground hover:text-foreground ml-1"
                    onClick={() => {
                      const allTasks = flattenTasksWithDepth(currentSheet.groups.flatMap(g => g.tasks))
                      const hasAnyExpanded = allTasks.some(ft => expandedSchedules[ft.task.id])
                      const newState: Record<string, boolean> = {}
                      allTasks.forEach(ft => { newState[ft.task.id] = !hasAnyExpanded })
                      setExpandedSchedules(newState)
                    }}
                  >
                    <CalendarIcon className="h-3 w-3" />
                    {flattenTasksWithDepth(currentSheet.groups.flatMap(g => g.tasks)).some(ft => expandedSchedules[ft.task.id]) ? "전체 날짜 접기" : "전체 날짜 펼치기"}
                  </Button>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => setIsCollapsed(!isCollapsed)} className={cn("h-8 w-8 p-0", !isCollapsed && "ml-auto")}>
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Rows area */}
          <div className="relative">
            {currentSheet.groups.map((group) => {
              const groupTasks = flattenTasksWithDepth(group.tasks)

              // Computation for "발전소 정비일정" tab + task "정비일정":
              let maintenanceDaysInCurrentYear = 0
              let hasMaintenanceTask = false
              let hasLegalInspection = false

              if (currentSheet.name === "발전소 정비일정") {
                const targetTasks = groupTasks.filter(gt => gt.task.name === "정비일정")
                if (targetTasks.length > 0) {
                  hasMaintenanceTask = true
                  const currentYearStart = startOfYear(new Date()).getTime()
                  const currentYearEnd = endOfYear(new Date()).getTime()

                  targetTasks.forEach(gt => {
                    gt.task.schedules.forEach(schedule => {
                      const startMs = schedule.startDate.getTime()
                      const endMs = schedule.endDate.getTime()

                      const intStartMs = Math.max(startMs, currentYearStart)
                      const intEndMs = Math.min(endMs, currentYearEnd)

                      if (intStartMs <= intEndMs) {
                        const s = startOfDay(new Date(intStartMs))
                        const e = startOfDay(new Date(intEndMs))
                        maintenanceDaysInCurrentYear += differenceInDays(e, s) + 1

                        if (schedule.memo && schedule.memo.includes("법정검사")) {
                          hasLegalInspection = true
                        }
                      }
                    })
                  })
                }
              }

              return (
                <div key={group.id} className="relative group/section first:border-t-0 border-t-4 border-slate-400 dark:border-slate-600">
                  {/* Group Header */}
                  <div className="flex border-b border-border min-w-full group-hover/section:bg-accent/5 transition-colors">
                    <div
                      className="sticky left-0 z-30 flex items-center gap-2 border-r border-border bg-slate-50 dark:bg-slate-900 px-4 py-3"
                      style={{ width: `${sidebarW}px`, height: '56px' }}
                    >
                      {editingGroupId === group.id ? (
                        <input
                          autoFocus
                          className="flex-1 bg-transparent border border-primary rounded px-2 py-0.5 text-sm font-bold"
                          defaultValue={group.name}
                          onBlur={(e) => { updateGroupName(group.id, e.target.value); setEditingGroupId(null) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { updateGroupName(group.id, (e.target as HTMLInputElement).value); setEditingGroupId(null) } }}
                        />
                      ) : (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex items-center min-w-0 shrinks-1 truncate">
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-400 truncate" onDoubleClick={() => isEditing && setEditingGroupId(group.id)}>
                              {group.name}
                            </span>
                            {hasMaintenanceTask && (
                              <span className="ml-1 text-sm font-bold text-slate-500 dark:text-slate-500 shrink-0">
                                ({new Date().getFullYear() % 100}년 전체정비{hasLegalInspection ? "+법정검사" : ""} {maintenanceDaysInCurrentYear}일)
                              </span>
                            )}
                          </div>
                          {isEditing && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/section:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingGroupId(group.id)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteGroup(group.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {isEditing && (
                        <div className="flex items-center gap-1 ml-auto">
                          {clipboardTask && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => pasteTaskIntoGroup(group.id)} title="Paste task into group">
                              <Clipboard className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => addTask(group.id)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {/* Placeholder for the timeline part of the group header */}
                    <div className="flex-1" />
                  </div>

                  {/* Group Tasks Area */}
                  <div className="relative">
                    {/* Maintenance dashed lines overlay for this group specifically */}
                    <div className="absolute inset-0 pointer-events-none z-10">
                      {group.tasks.map((task) => {
                        if (task.type !== 'maintenance') return null
                        return task.schedules.map((schedule) => {
                          const pos = calculateSchedulePosition(schedule)
                          const isNarrow = (pos.endPercent - pos.leftPercent) < 4
                          const scheduleColor = schedule.color || '#3b82f6'
                          const bgColor = scheduleColor + '1A'
                          const borderColor = scheduleColor + 'B3'

                          return (
                            <div key={`maint-line-${schedule.id}`} className="absolute inset-y-0 w-full h-full">
                              <div
                                className="absolute bottom-0 pointer-events-none"
                                style={{ left: `${pos.leftPercent}%`, width: `${pos.endPercent - pos.leftPercent}%`, top: '0px', backgroundColor: bgColor }}
                              />
                              <div
                                className="absolute bottom-0 w-px border-l border-dashed"
                                style={{ left: `${pos.leftPercent}%`, top: '-35px', borderColor: borderColor }}
                              >
                                <div
                                  className="absolute top-0 -translate-x-full text-white text-[10px] px-1 py-0.5 leading-none whitespace-nowrap font-medium z-20 rounded-t-sm"
                                  style={{ backgroundColor: scheduleColor }}
                                >
                                  {format(schedule.startDate, "M/d (eee)", { locale: ko })}
                                </div>
                              </div>
                              {schedule.memo && (
                                <div
                                  className="absolute text-[11px] font-semibold whitespace-nowrap text-center -translate-x-1/2 z-20"
                                  style={{ left: `${pos.leftPercent + (pos.endPercent - pos.leftPercent) / 2}%`, top: '-55px', color: scheduleColor }}
                                >
                                  {/* Memo display adjusted for group visibility */}
                                  <span className="bg-background/80 px-1 rounded shadow-sm">{schedule.memo}</span>
                                </div>
                              )}
                              <div
                                className="absolute bottom-0 w-px border-l border-dashed"
                                style={{ left: `${pos.endPercent}%`, top: '-20px', borderColor: borderColor }}
                              >
                                <div
                                  className="absolute top-0 -translate-x-[2px] text-white text-[10px] px-1 py-0.5 leading-none whitespace-nowrap font-medium z-20 rounded-t-sm"
                                  style={{ backgroundColor: scheduleColor }}
                                >
                                  {format(schedule.endDate, "M/d (eee)", { locale: ko })}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      })}
                    </div>

                    {/* Task Rows */}
                    {groupTasks.map(({ task, depth }) => (
                      <div
                        key={task.id}
                        draggable={isEditing}
                        onDragStart={(e) => {
                          if (!isEditing) return
                          setDraggedTaskId(task.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (!isEditing) return
                          if (draggedTaskId && draggedTaskId !== task.id) {
                            setDragOverTaskId(task.id)
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverTaskId === task.id) {
                            setDragOverTaskId(null)
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (!isEditing) return
                          if (draggedTaskId && draggedTaskId !== task.id) {
                            moveTask(group.id, draggedTaskId, task.id)
                          }
                          setDraggedTaskId(null)
                          setDragOverTaskId(null)
                        }}
                        onDragEnd={() => {
                          setDraggedTaskId(null)
                          setDragOverTaskId(null)
                        }}
                        className={cn(
                          "relative flex items-center border-b border-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors group/row",
                          dragOverTaskId === task.id && "border-t-2 border-t-primary bg-primary/5",
                          draggedTaskId === task.id && "opacity-50"
                        )}
                        style={{ minHeight: `${ROW_HEIGHT}px` }}
                      >
                        {/* Drag Handle Indicator */}
                        <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground z-30 transition-opacity">
                          <div className="grid grid-cols-2 gap-[2px]">
                            <div className="w-1 h-1 rounded-full bg-current"></div>
                            <div className="w-1 h-1 rounded-full bg-current"></div>
                            <div className="w-1 h-1 rounded-full bg-current"></div>
                            <div className="w-1 h-1 rounded-full bg-current"></div>
                            <div className="w-1 h-1 rounded-full bg-current"></div>
                            <div className="w-1 h-1 rounded-full bg-current"></div>
                          </div>
                        </div>

                        {/* Left: Task Info (sticky) */}
                        <div
                          className="sticky left-0 z-20 shrink-0 flex items-center border-r border-border bg-card group-hover/row:bg-accent/50 transition-colors"
                          style={{ width: `${sidebarW}px`, minHeight: `${ROW_HEIGHT}px`, paddingLeft: `${depth * 20 + 16}px`, paddingRight: '16px' }}
                        >
                          {!isCollapsed && (
                            <>
                              <div className="flex items-center gap-1 mr-2 self-start mt-4">
                                {task.children && task.children.length > 0 ? (
                                  <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-muted" onClick={(e) => { e.stopPropagation(); toggleExpand(group.id, task.id) }}>
                                    {task.isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                  </Button>
                                ) : <div className="w-4" />}
                              </div>

                              <div className="flex-1 min-w-0 flex flex-col justify-center gap-0 py-0 px-2">
                                {/* Name + Type + Actions */}
                                <div className="flex items-center justify-between w-full h-5">
                                  <div className="flex items-center gap-1 min-w-0 flex-1">
                                    {task.schedules.length > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 p-0 shrink-0 hover:bg-muted"
                                        onClick={(e) => { e.stopPropagation(); toggleScheduleVisibility(task.id) }}
                                        title={expandedSchedules[task.id] ? "날짜 접기" : "날짜 펼치기"}
                                      >
                                        {expandedSchedules[task.id] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                      </Button>
                                    )}
                                    {editingId === task.id ? (
                                      <input
                                        autoFocus
                                        className="w-full bg-transparent border border-primary rounded px-1 text-sm h-5"
                                        defaultValue={task.name}
                                        onBlur={(e) => { updateTaskName(group.id, task.id, e.target.value); setEditingId(null) }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { updateTaskName(group.id, task.id, (e.target as HTMLInputElement).value); setEditingId(null) } }}
                                      />
                                    ) : (
                                      <div
                                        className="group/name flex items-center gap-1 font-medium text-sm text-foreground cursor-pointer truncate"
                                        onDoubleClick={() => setEditingId(task.id)}
                                      >
                                        <span className="truncate">{task.name}</span>
                                        {isEditing && (
                                          <Pencil
                                            className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0"
                                            onClick={(e) => { e.stopPropagation(); setEditingId(task.id) }}
                                          />
                                        )}
                                      </div>
                                    )}
                                    <div
                                      className={cn(
                                        "flex items-center justify-center w-4 h-4 rounded shrink-0",
                                        isEditing ? "cursor-pointer hover:bg-muted" : "pointer-events-none"
                                      )}
                                      onClick={(e) => {
                                        if (!isEditing) return
                                        e.stopPropagation()
                                        updateTaskType(group.id, task.id, task.type === 'inspection' ? 'maintenance' : 'inspection')
                                      }}
                                      title={isEditing ? "Click to toggle type" : undefined}
                                    >
                                      <span className={cn(
                                        "text-[9px] font-black w-3.5 h-3.5 flex items-center justify-center rounded leading-none border-[0.5px]",
                                        task.type === 'inspection'
                                          ? "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800"
                                          : "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800"
                                      )}>
                                        {task.type === 'inspection' ? "B" : "L"}
                                      </span>
                                    </div>
                                    {isEditing && task.type !== 'maintenance' && (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            className="w-3.5 h-3.5 rounded-full shrink-0 border border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                                            style={{ backgroundColor: task.color || DEFAULT_BAR_COLOR }}
                                            title="Bar color"
                                          />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-2" align="start">
                                          <div className="grid grid-cols-10 gap-1.5">
                                            {BAR_COLORS.map((c) => (
                                              <button
                                                key={c.value}
                                                className={cn(
                                                  "w-6 h-6 rounded-full hover:scale-110 transition-transform",
                                                  (task.color || DEFAULT_BAR_COLOR) === c.value && "ring-2 ring-offset-1 " + c.ring
                                                )}
                                                style={{ backgroundColor: c.value }}
                                                onClick={() => updateTaskColor(group.id, task.id, c.value)}
                                                title={c.name}
                                              />
                                            ))}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    )}

                                  </div>
                                  {isEditing && (
                                    <div className="flex items-center group-hover/row:opacity-100 transition-opacity ml-1 shrink-0">
                                      <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50/50 p-0" onClick={(e) => { e.stopPropagation(); copyTask(task) }} title="Copy task">
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                      {clipboardTask && (
                                        <Button variant="ghost" size="icon" className="h-5 w-5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50 p-0" onClick={(e) => { e.stopPropagation(); pasteTaskAsSubtask(group.id, task.id) }} title="Paste as subtask">
                                          <Clipboard className="h-3 w-3" />
                                        </Button>
                                      )}
                                      <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); addTask(group.id, task.id) }} title="Add subtask">
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm("Delete task?")) deleteTask(group.id, task.id) }} title="Delete">
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                {/* Schedule Date Pickers (multiple) */}
                                {(task.schedules.length <= 1 || expandedSchedules[task.id]) && (
                                  <>
                                    {task.schedules.map((schedule, sIdx) => (
                                      <div
                                        key={schedule.id}
                                        draggable={isEditing}
                                        onDragStart={(e) => {
                                          if (!isEditing) return
                                          e.stopPropagation()
                                          setDraggedScheduleId(schedule.id)
                                          e.dataTransfer.effectAllowed = 'move'
                                        }}
                                        onDragOver={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          if (!isEditing) return
                                          if (draggedScheduleId && draggedScheduleId !== schedule.id) {
                                            setDragOverScheduleId(schedule.id)
                                          }
                                        }}
                                        onDragLeave={(e) => {
                                          e.stopPropagation()
                                          if (dragOverScheduleId === schedule.id) {
                                            setDragOverScheduleId(null)
                                          }
                                        }}
                                        onDrop={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          if (!isEditing) return
                                          if (draggedScheduleId && draggedScheduleId !== schedule.id) {
                                            moveSchedule(group.id, task.id, draggedScheduleId, schedule.id)
                                          }
                                          setDraggedScheduleId(null)
                                          setDragOverScheduleId(null)
                                        }}
                                        onDragEnd={(e) => {
                                          e.stopPropagation()
                                          setDraggedScheduleId(null)
                                          setDragOverScheduleId(null)
                                        }}
                                        className={cn(
                                          "group/schedule relative flex items-center gap-1 text-[11px] font-medium text-foreground/80 py-0.5 px-1 rounded transition-all",
                                          isEditing ? "cursor-grab active:cursor-grabbing hover:bg-muted" : "pointer-events-none",
                                          dragOverScheduleId === schedule.id && "bg-primary/10 ring-1 ring-primary/30",
                                          draggedScheduleId === schedule.id && "opacity-50"
                                        )}
                                      >
                                        {isEditing && task.type === 'maintenance' && (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button
                                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-border shadow-sm hover:scale-110 transition-transform cursor-pointer"
                                                style={{ backgroundColor: schedule.color || DEFAULT_BAR_COLOR }}
                                                title="Schedule color"
                                              />
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-2" align="start">
                                              <div className="grid grid-cols-10 gap-1.5">
                                                {BAR_COLORS.map((c) => (
                                                  <button
                                                    key={c.value}
                                                    className={cn(
                                                      "w-6 h-6 rounded-full hover:scale-110 transition-transform",
                                                      (schedule.color || DEFAULT_BAR_COLOR) === c.value && "ring-2 ring-offset-1 " + c.ring
                                                    )}
                                                    style={{ backgroundColor: c.value }}
                                                    onClick={(e) => { e.stopPropagation(); updateScheduleColor(group.id, task.id, schedule.id, c.value); }}
                                                    title={c.name}
                                                  />
                                                ))}
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        )}
                                        <InlineDatePicker
                                          date={schedule.startDate}
                                          isEditing={isEditing}
                                          onSelect={(date) => updateScheduleDate(group.id, task.id, schedule.id, 'startDate', date)}
                                        />
                                        <span className="shrink-0 font-bold">-</span>
                                        <InlineDatePicker
                                          date={schedule.endDate}
                                          isEditing={isEditing}
                                          onSelect={(date) => updateScheduleDate(group.id, task.id, schedule.id, 'endDate', date)}
                                          defaultMonth={schedule.startDate}
                                        />
                                        {isEditing && (
                                          <button
                                            className="text-muted-foreground hover:text-destructive shrink-0 ml-0.5 transition-opacity"
                                            onClick={() => deleteSchedule(group.id, task.id, schedule.id)}
                                            title="Delete schedule"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        )}
                                        <input
                                          className={cn(
                                            "ml-1 min-w-0 flex-1 bg-transparent border-b border-transparent text-[11px] font-bold text-foreground placeholder:text-muted-foreground/40 transition-colors",
                                            isEditing ? "hover:border-muted-foreground/30 focus:border-primary focus:outline-none" : "pointer-events-none"
                                          )}
                                          placeholder="메모"
                                          maxLength={40}
                                          readOnly={!isEditing}
                                          value={schedule.memo || ''}
                                          onChange={(e) => updateScheduleMemo(group.id, task.id, schedule.id, e.target.value)}
                                        />
                                      </div>
                                    ))}
                                    {isEditing && (
                                      <button
                                        className="text-[10px] text-primary/40 hover:text-primary transition-colors self-start mt-0.5"
                                        onClick={() => addSchedule(group.id, task.id)}
                                      >
                                        + 일정 추가
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Right: Timeline Bars/Lines (multiple) */}
                        {task.type === 'inspection' && task.schedules.map((schedule) => {
                          const pos = calculateSchedulePosition(schedule)
                          const barColor = task.color || DEFAULT_BAR_COLOR
                          return (
                            <div key={`bar-${schedule.id}`} className="contents">
                              <div
                                className="absolute text-[10px] font-bold text-foreground/80 bg-background/40 px-1 rounded-sm whitespace-nowrap z-5"
                                style={{ left: pos.left, top: '2px' }}
                              >
                                {format(schedule.startDate, "yyyy-MM-dd") === format(schedule.endDate, "yyyy-MM-dd")
                                  ? format(schedule.startDate, "M/d (eee)", { locale: ko })
                                  : `${format(schedule.startDate, "M/d (eee)", { locale: ko })} ~ ${format(schedule.endDate, "M/d (eee)", { locale: ko })}`}
                              </div>
                              <div
                                className="absolute h-6 rounded-md transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:z-10"
                                style={{ left: pos.left, width: pos.width, top: '16px', backgroundColor: barColor }}
                              />
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Today Marker - Moved outside the group loop as it's global */}
            {todayPositionPercent != null && (
              <div
                className="absolute -top-12 bottom-0 z-20 border-l border-red-500/80 shadow-[0_0_2px_rgba(239,68,68,0.3)] pointer-events-none"
                style={{ left: `${todayPositionPercent}%` }}
                title="Today"
              >
                <div className="absolute top-0 -translate-x-1/2 bg-red-400 text-white text-[11px] px-2 py-1 rounded-sm whitespace-nowrap font-extrabold shadow-md pointer-events-auto">
                  Today ({format(getCorrectedNow(), "yyyy-MM-dd")})
                </div>
              </div>
            )}

            {/* Hover Guide Line */}
            {hoverPosition && (
              <div
                className="absolute -top-12 bottom-0 z-[100] pointer-events-none w-0 hover-guide-line"
                style={{ left: `${hoverPosition.percent}%` }}
              >
                <div className="absolute top-[48px] bottom-0 border-l-2 border-slate-900 dark:border-slate-100" />
                <div className="absolute top-7 -translate-x-1/2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] px-2 py-0.5 rounded-sm whitespace-nowrap font-bold shadow-lg">
                  {format(hoverPosition.date, "yyyy-MM-dd (eee)", { locale: ko })}
                </div>
              </div>
            )}

            {/* Add Group Button at the bottom */}
            {isEditing && (
              <div className="flex border-b border-border bg-slate-50/20 dark:bg-slate-900/10">
                <div
                  className="sticky left-0 z-30 flex items-center justify-center border-r border-border min-h-[48px]"
                  style={{ width: `${sidebarW}px` }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-primary/60 hover:text-primary transition-colors font-bold text-xs"
                    onClick={addGroup}
                  >
                    <Plus className="h-4 w-4" />
                    그룹 추가
                  </Button>
                </div>
                <div className="flex-1" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}