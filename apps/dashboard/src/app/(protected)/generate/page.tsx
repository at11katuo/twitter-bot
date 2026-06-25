import GenerateClient from './_client'

export default function GeneratePage({
  searchParams,
}: {
  searchParams: { count?: string }
}) {
  const raw   = parseInt(searchParams.count ?? '1', 10)
  const count = Number.isFinite(raw) ? Math.max(1, Math.min(10, raw)) : 1
  return <GenerateClient count={count} />
}
