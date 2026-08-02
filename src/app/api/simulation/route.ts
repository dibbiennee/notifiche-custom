import { BadRequestError, assertAuthorized, errorResponse } from '@/lib/auth';
import { DEFAULT_SIMULATION, isSimulation, type Simulation } from '@/lib/simulation';
import { getStore } from '@/lib/store';

/**
 * Le impostazioni della dashboard, condivise fra la app iOS e il browser.
 *
 * Non c'è una riga per dispositivo: è una sola, e chi scrive per ultimo vince.
 * È la scelta che rende inutile qualsiasi sincronizzazione: aprendo il browser
 * si vedono per forza i numeri del telefono, perché sono gli stessi numeri.
 */

const MAX_SEED = Number.MAX_SAFE_INTEGER;

function readSimulation(body: unknown): Simulation {
  if (!isSimulation(body)) throw new BadRequestError('Impostazioni non valide');

  const amounts = body.paymentAmounts.filter((a) => typeof a === 'number' && a > 0);
  if (amounts.length === 0) {
    throw new BadRequestError('Serve almeno un importo di pagamento');
  }
  if (body.dailyMin < 0 || body.dailyMax < 0) {
    throw new BadRequestError("L'incasso giornaliero non può essere negativo");
  }
  // Oltre 2^53 il numero non sopravvive al giro in JSON, e telefono e browser
  // genererebbero cifre diverse partendo dallo stesso seme.
  if (!Number.isSafeInteger(body.seed) || body.seed < 0 || body.seed > MAX_SEED) {
    throw new BadRequestError('Seed non valido');
  }

  return {
    merchantName: body.merchantName.slice(0, 80),
    currency: body.currency ?? 'usd',
    dailyMin: body.dailyMin,
    dailyMax: body.dailyMax,
    paymentAmounts: amounts,
    netDeductionPercent: body.netDeductionPercent ?? 2,
    repeatCustomerPercent: body.repeatCustomerPercent ?? 0,
    businessDays: Math.max(2, Math.round(body.businessDays ?? 400)),
    seed: body.seed,
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const simulation = (await getStore().getSimulation()) ?? DEFAULT_SIMULATION;
    return Response.json({ simulation });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);
    const simulation = readSimulation(await request.json().catch(() => null));
    await getStore().setSimulation(simulation);
    return Response.json({ simulation });
  } catch (error) {
    return errorResponse(error);
  }
}
