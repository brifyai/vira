'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  AudioLines,
  FileAudio,
  FolderSync,
  Quote,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const hashParams = new URLSearchParams(hash);

    const type = hashParams.get('type') || searchParams.get('type');
    const errorCode = hashParams.get('error_code') || searchParams.get('error_code');
    const error = hashParams.get('error') || searchParams.get('error');

    if (type === 'recovery') {
      const hashSuffix = window.location.hash || '';
      const querySuffix = window.location.search || '';
      router.replace(`/reset-password${querySuffix}${hashSuffix}`);
      return;
    }

    if (errorCode || error) {
      router.replace(
        `/forgot-password?error=${encodeURIComponent(errorCode || error || 'unknown')}`
      );
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-blue-600/25 blur-[120px]" />
        <div className="absolute -bottom-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-indigo-500/20 blur-[120px]" />
      </div>

      <header className="relative mx-auto max-w-6xl px-6 pt-10">
        <nav className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600/20 ring-1 ring-inset ring-blue-500/30">
              <Sparkles className="h-5 w-5 text-blue-200" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Verificador</div>
              <div className="text-xs text-slate-300">Monitoreo y evidencia</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/forgot-password"
              className="hidden rounded-xl px-3 py-2 text-sm text-slate-200 hover:bg-white/5 sm:inline-flex"
            >
              Recuperar acceso
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Iniciar sesión
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-14">
        <section className="grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Evidencia y trazabilidad para campañas y menciones
            </div>

            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Verificación de audios con reportes claros, búsqueda por frases y resultados por radio
            </h1>

            <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-slate-200 sm:text-lg">
              Centraliza la carga de audios, define frases objetivo y obtén un resumen con coincidencias,
              timestamps y transcripciones. Ideal para control de pauta y monitoreo de menciones.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Ir al Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#flujo"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Ver cómo funciona
                <ArrowRight className="h-4 w-4 text-slate-200" />
              </Link>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <FileAudio className="h-4 w-4 text-blue-200" />
                  Audio
                </div>
                <div className="mt-1 text-sm text-slate-200">Carga manual o desde Drive</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Quote className="h-4 w-4 text-blue-200" />
                  Frases
                </div>
                <div className="mt-1 text-sm text-slate-200">Define objetivos por campaña</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <AudioLines className="h-4 w-4 text-blue-200" />
                  Evidencia
                </div>
                <div className="mt-1 text-sm text-slate-200">Timestamps y resultados</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div
              id="flujo"
              className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-6 backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Flujo de verificación</div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  4 pasos
                </div>
              </div>

              <ol className="mt-5 space-y-4">
                <li className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600/20 ring-1 ring-inset ring-blue-500/30">
                      <FolderSync className="h-5 w-5 text-blue-200" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">1) Ingesta de audios</div>
                      <div className="mt-1 text-sm text-slate-200">
                        Sube archivos manualmente o, si el administrador lo habilitó, sincroniza desde Google Drive.
                      </div>
                    </div>
                  </div>
                </li>
                <li className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600/20 ring-1 ring-inset ring-blue-500/30">
                      <Quote className="h-5 w-5 text-blue-200" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">2) Frases objetivo</div>
                      <div className="mt-1 text-sm text-slate-200">
                        Define frases por marca, mención o creatividad a detectar.
                      </div>
                    </div>
                  </div>
                </li>
                <li className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600/20 ring-1 ring-inset ring-blue-500/30">
                      <Sparkles className="h-5 w-5 text-blue-200" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">3) Análisis y coincidencias</div>
                      <div className="mt-1 text-sm text-slate-200">
                        Procesa transcripción y calcula coincidencias con su precisión.
                      </div>
                    </div>
                  </div>
                </li>
                <li className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600/20 ring-1 ring-inset ring-blue-500/30">
                      <ShieldCheck className="h-5 w-5 text-blue-200" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">4) Reporte y evidencia</div>
                      <div className="mt-1 text-sm text-slate-200">
                        Genera resúmenes por radio con timestamps y trazabilidad.
                      </div>
                    </div>
                  </div>
                </li>
              </ol>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                Nota: Drive lo configura el <span className="font-semibold text-white">super admin</span>. Los usuarios
                solo cargan audios, seleccionan frases y revisan resultados.
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="text-2xl font-semibold text-white">Alcances del sistema</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">
              Diseñado para equipos que necesitan control de pauta y monitoreo continuo. Mantén audios,
              frases y resultados centralizados, con acceso por roles y reportes exportables.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <FileAudio className="h-4 w-4 text-blue-200" />
                  Carga flexible
                </div>
                <div className="mt-2 text-sm text-slate-200">
                  Importa desde Drive o carga manual según tu operación.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Quote className="h-4 w-4 text-blue-200" />
                  Biblioteca de frases
                </div>
                <div className="mt-2 text-sm text-slate-200">
                  Reutiliza frases y mejora consistencia entre verificaciones.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <AudioLines className="h-4 w-4 text-blue-200" />
                  Evidencia accionable
                </div>
                <div className="mt-2 text-sm text-slate-200">
                  Detecta coincidencias y revisa los momentos exactos del audio.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <ShieldCheck className="h-4 w-4 text-blue-200" />
                  Control por roles
                </div>
                <div className="mt-2 text-sm text-slate-200">
                  Admin, super admin y clientes con accesos diferenciados.
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-sm font-semibold text-white">Preguntas rápidas</h3>
              <div className="mt-4 space-y-3">
                <details className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-white">
                    ¿Puedo subir audios manualmente?
                  </summary>
                  <div className="mt-2 text-sm text-slate-200">
                    Sí. Además puedes conectar Drive para centralizar la carga.
                  </div>
                </details>
                <details className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-white">
                    ¿Cómo se agregan frases?
                  </summary>
                  <div className="mt-2 text-sm text-slate-200">
                    Define frases objetivo y selecciónalas al crear una verificación o resumen.
                  </div>
                </details>
                <details className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-white">
                    ¿Qué obtengo como resultado?
                  </summary>
                  <div className="mt-2 text-sm text-slate-200">
                    Coincidencias, transcripción y evidencia con timestamps por radio.
                  </div>
                </details>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-100"
                >
                  Entrar al sistema
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/forgot-password"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Recuperar contraseña
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-16 border-t border-white/10 pt-8 text-center text-xs text-slate-400">
          Verificador de Radios · Plataforma de verificación y evidencia
        </footer>
      </main>
    </div>
  );
}
