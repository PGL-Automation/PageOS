"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

type RolePermission = {
  module: string
  can_view: boolean
  can_create: boolean
  can_approve: boolean
  can_export: boolean
}

type Action = "view" | "create" | "approve" | "export"

const ACTION_FIELD_MAP: Record<Action, keyof RolePermission> = {
  view: "can_view",
  create: "can_create",
  approve: "can_approve",
  export: "can_export",
}

const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081"}/api/v1`

async function fetchFinancePermissions(): Promise<RolePermission[]> {
  const res = await fetch(`${BASE_URL}/finance/permissions/me`, {
    credentials: "include",
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch finance permissions: ${res.status}`)
  }
  return res.json()
}

export function useFinancePermissions() {
  const { data, isLoading } = useQuery<RolePermission[]>({
    queryKey: ["finance-permissions-me"],
    queryFn: fetchFinancePermissions,
    staleTime: 5 * 60 * 1000, // 5 minutes — permissions rarely change mid-session
  })

  const permissions = useMemo<Record<string, RolePermission> | undefined>(() => {
    if (!data) return undefined
    return Object.fromEntries(data.map((p) => [p.module, p]))
  }, [data])

  const can = useMemo(() => {
    return (module: string, action: Action): boolean => {
      if (isLoading || !permissions) return false
      const entry = permissions[module]
      if (!entry) return false
      const field = ACTION_FIELD_MAP[action]
      return entry[field] === true
    }
  }, [isLoading, permissions])

  return { can, permissions, isLoading }
}
