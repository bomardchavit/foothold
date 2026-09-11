/**
 * Whether the feed should try `/api/logo/{id}` for a company at all. Only a stored logo counts: without one the
 * route can only 404 or bounce to a third-party favicon service, and the initials tile is the right first paint.
 */
export function companyHasLogo(company: { logoKey: string | null }): boolean {
  return Boolean(company.logoKey);
}
