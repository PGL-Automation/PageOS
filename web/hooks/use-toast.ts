"use client"

// Simplified toast hook
import * as React from "react"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = any

let memoryState: any = { toasts: [] }

function dispatch(action: any) {
  memoryState = reducer(memoryState, action)
}

function reducer(state: any, action: any) {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t: any) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }
    case "DISMISS_TOAST":
      const { toastId } = action
      if (toastId) {
        return {
          ...state,
          toasts: state.toasts.filter((t: any) => t.id !== toastId),
        }
      }
      return {
        ...state,
        toasts: [],
      }
  }
}

export function toast({ ...props }: any) {
  const id = Math.random().toString(36).substr(2, 9)
  const update = (props: any) =>
    dispatch({ type: "UPDATE_TOAST", toast: { ...props, id } })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open) dismiss()
      },
    },
  })

  // Basic console log for development since we don't have the full toaster UI working
  console.log(`[TOAST] ${props.title}: ${props.description}`)

  return { id, dismiss, update }
}

export function useToast() {
  const [state, setState] = React.useState<any>(memoryState)

  React.useEffect(() => {
    // We would subscribe here in a real implementation
    setState(memoryState)
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}