"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

export type ResolvedCapability = {
  code: string
  name: string
  description: string
  domain: string
  sort_order: number
  granted: boolean
  source: "role_default" | "individual_grant" | "individual_revoke"
}

const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081"}/api/v1`

async function fetchMyCapabilities(): Promise<ResolvedCapability[]> {
  const res = await fetch(`${BASE_URL}/org/capabilities/me`, {
    credentials: "include",
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch capabilities: ${res.status}`)
  }
  return res.json()
}

async function fetchPersonCapabilities(personId: string): Promise<ResolvedCapability[]> {
  const res = await fetch(`${BASE_URL}/org/capabilities/person/${personId}`, {
    credentials: "include",
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch capabilities for person ${personId}: ${res.status}`)
  }
  return res.json()
}

function buildCanFn(
  capabilities: ResolvedCapability[] | undefined,
  isLoading: boolean,
): (code: string) => boolean {
  if (isLoading || !capabilities) return () => false
  const index = new Map(capabilities.map((c) => [c.code, c.granted]))
  return (code: string) => index.get(code) ?? false
}

// useCapabilities — returns the current user's resolved capabilities
export function useCapabilities(): {
  can: (code: string) => boolean
  capabilities: ResolvedCapability[] | undefined
  isLoading: boolean
} {
  const { data, isLoading } = useQuery<ResolvedCapability[]>({
    queryKey: ["capabilities-me"],
    queryFn: fetchMyCapabilities,
    staleTime: 5 * 60 * 1000, // 5 minutes — capabilities rarely change mid-session
  })

  const can = useMemo(() => buildCanFn(data, isLoading), [data, isLoading])

  return { can, capabilities: data, isLoading }
}

// usePersonCapabilities — returns resolved capabilities for a specific person
export function usePersonCapabilities(personId: string | null): {
  can: (code: string) => boolean
  capabilities: ResolvedCapability[] | undefined
  isLoading: boolean
} {
  const { data, isLoading } = useQuery<ResolvedCapability[]>({
    queryKey: ["capabilities-person", personId],
    queryFn: () => fetchPersonCapabilities(personId!),
    enabled: personId !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const can = useMemo(() => buildCanFn(data, isLoading), [data, isLoading])

  return { can, capabilities: data, isLoading }
}
