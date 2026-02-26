-- Script to insert JSON data into news_sources and scraped_news
-- Run this in Supabase SQL Editor

DO $$
DECLARE
    v_source_id uuid;
BEGIN
    -- 1. Ensure the Source "Soy Chile" exists and get its ID
    -- We check by name to avoid duplicates
    SELECT id INTO v_source_id FROM public.news_sources WHERE name = 'Soy Chile' LIMIT 1;

    IF v_source_id IS NULL THEN
        INSERT INTO public.news_sources (name, url, category, is_active)
        VALUES ('Soy Chile', 'https://soychile.cl', 'general', true)
        RETURNING id INTO v_source_id;
    END IF;

    -- 2. Insert the News Item (scraped_news)
    -- Using the ID from the JSON to maintain consistency
    INSERT INTO public.scraped_news (
        id,
        source_id,
        title,
        content,
        summary,
        original_url,
        image_url,
        published_at,
        scraped_at,
        is_processed,
        is_selected,
        category
    ) VALUES (
        '04c5d6fe-4480-41d1-a174-eb97c3a03354', -- UUID from JSON
        v_source_id,
        'Defensor apuntó a que otros jueces votaron igual que Vivanco: "Tendríamos que tener cinco ministros sentados aquí"',
        'Esta jornada continúa la formalización en contra de la exministra de la Corte Suprema, Ángela Vivanco, acusada por los delitos de cohecho y lavado de activos por su participación en la denominada “trama bielorrusa”.&nbsp;

Este jueves la defensa de la exjueza presentará sus argumentos, antes de que el Séptimo Juzgado de Garantía resuelva mañana viernes las medidas cautelares. El Ministerio Público solicita prisión preventiva en contra de Vivanco.

En la audiencia de esta jornada la defensa apuntaría a evaluar si los antecedentes sostienen los delitos imputados y la participación de Vivanco, y determinar si se cumplen los requisitos legales para aplicar la cautelar más grave.

Durante la jornada inicial de este lunes, la defensa intentó cuestionar la ilegalidad de la detención, luego de la acusación de la Fiscalía, hecho que fue rechazado por el tribunal.

El martes, fue el turno de los querellantes, donde Codelco, el Consejo de Defensa del Estado y la Organización de Trabajadores Judiciales, expusieron sus argumentos en contra de la exjueza del máximo tribunal.&nbsp;

',
        'Esta jornada continúa la formalización en contra de la exministra de la Corte Suprema, Ángela Vivanco, acusada por los delitos de cohecho y lavado de activos por su participación en la denominada “tra...',
        'https://soychile.cl/santiago/sociedad/2026/01/29/938273/vivanco-formalizacion-exposicion-defensa.html',
        'data:image/webp;base64,UklGRlYCAABXRUJQVlA4WAoAAAAQAAAAZAAAGwAAQUxQSNIBAAABfyAQSFLYH3iFiEgd5GrbtjjKM3HPtDgtVbalCu6QnEGGI9jtcFZaLNeeAE7n7qSidevcHdZl/rcYC2t1RP8ngLngiPxWwR+lp1ZdhQjO94cb23HG1YF40AU1wi2d/C1loj2TpO6gY6qGu/Awbj+IR3LkXRzUMZkO969COwf0ev2aV+kgb6jBcltcZcGGEdUnHibpUtmv372fgoGqX//k2QQrflvwturotYV3RGNSI4Qj6Si0Xsc9K4zMeTApGC401UmApPshhnTPVZql5nwcGDhi1U2O0TxMpFuqBG2zXYVwH1pNleC47sdhPAcDNf5VsGX9UTkozkiIuqosVQ04qW5sxeHYUVrddJ0nFKF61L1jh7oBLiu1QoDzGuchrRotVdtzQV4fxhb7rBC2iQ8Uaar7//2t+TivYSw7msHRa6stTS0h+E3NVgKaR2Gg5MbA1Tyw45Ecdfp0AIMVxvPwrgato/eBQb1ev+bL4ki2+Z3AsRheznaT49352Ao3B44agCPvkUiM6OFtpfkoo/OwwsicB2xTAvjo2R+tS5KK2NfN2QTQO3k3CTCe8XDGaI8VjT5Xeyyiu3GfKb3iIVP/QufUs0cLU65Hv2NTrvl6GVMRVlA4IF4AAADQBACdASplABwAPm0oj0ekIqEhPaCADYlpAADhINTH+bbJulY0FGAFpkLzIFzhAAD++yOur//9wAT/19htefv//5BX/+P5P//Ho7f91Uzm+6f//t2wHv//xDoAAAAA',
        '2026-01-29 14:33:33.331+00',
        '2026-01-29 14:33:33.331+00',
        false,
        false,
        'general'
    )
    ON CONFLICT (id) DO NOTHING;
END $$;
