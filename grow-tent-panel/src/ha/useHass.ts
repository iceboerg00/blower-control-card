import { useHassContext } from './HassProvider';

export function useHass() {
  const hass = useHassContext();

  function callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ): void {
    hass?.callService(domain, service, data).catch(console.error);
  }

  async function callWS(message: Record<string, unknown>): Promise<unknown> {
    if (!hass) return null;
    return hass.callWS(message);
  }

  return { hass, callService, callWS };
}
