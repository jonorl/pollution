// Every piece of interface text, in English and Argentine Spanish. Numbers and times arrive
// already formatted for the language, so nothing here formats values itself.

export const en = {
  title: 'Air quality',
  language: 'Language',
  place: 'Kololo, Kampala',

  about: {
    open: 'About',
    title: 'About this project',
    close: 'Close',
    intro:
      'A home-built air-quality monitor: a laser particle sensor, a microcontroller and a small web stack, measuring the air in my office around the clock.',
    sections: [
      { id: 'where', heading: 'Where', body: 'My office in Kololo, Kampala, Uganda.' },
      {
        id: 'hardware',
        heading: 'Hardware',
        body: 'A Plantower PMS5003 laser sensor reports PM1.0, PM2.5 and PM10, and counts particles from 0.3 µm up. A TMP36 reads the temperature. Both are wired to an ESP32-S3 microcontroller, whose RGB LED glows in the same band colours as this page.',
      },
      {
        id: 'device',
        heading: 'On the device',
        body: 'Firmware written in Rust reads the sensor every 5 seconds, drops any reading that fails its checksum, and averages 12 of them into one a minute. Each temperature is the mean of 32 quick samples, to smooth out electrical noise.',
      },
      {
        id: 'pipeline',
        heading: 'Pipeline',
        body: 'Every minute the average goes over HTTPS, with the server’s certificate checked, to an API on a VPS that stores it in PostgreSQL. This page asks for new readings every 30 seconds; the database works out the 5-minute and daily averages the longer views use.',
      },
    ],
    stack: 'Stack',
    photo: 'The ESP32-S3 board on a breadboard, wired to the blue PMS5003 sensor by a ribbon cable.',
    source: 'Source code on GitHub',
  },

  status: {
    connecting: 'Connecting…',
    live: (time: string) => `Live · updated ${time}`,
    quiet: (time: string) => `Sensor quiet since ${time}`,
    apiRetrying: ' · API unreachable, retrying',
    apiDown: 'Can’t reach the API · retrying every 30 s',
    noReadings: 'No readings in the last 24 hours',
  },

  now: {
    heading: 'PM2.5 · latest 1-minute average',
    whoBand: 'WHO band',
    temperature: 'Temperature',
    loading: 'Fetching the last 24 hours…',
    empty: 'No readings yet. Power the sensor and its first 1-minute average appears here within about a minute.',
  },

  day: {
    heading: 'Last 24 hours',
    peak: 'Peak',
    lowest: 'Lowest',
    recorded: 'Recorded',
    temperature: 'Temperature',
    at: (time: string) => `at ${time}`,
    ofMinutes: (total: string) => `of ${total} minutes`,
    empty: 'Nothing recorded in the last 24 hours.',
    meanUnit: 'µg/m³ mean PM2.5',
    within: (guideline: string) => `Within the WHO 24-hour guideline of ${guideline}`,
    above: (over: string, guideline: string) => `${over} above the WHO 24-hour guideline of ${guideline}`,
    bandsHeading: 'WHO bands · PM2.5',
    bandsNote:
      'Bands follow WHO’s 2021 24-hour guideline for PM2.5, 15, and its interim targets: 25, 37.5, 50 and 75. They’re set for 24-hour means; shorter readings are shown against them for context.',
  },

  // WHO numbers its interim targets rather than naming them; these names are ours.
  bands: {
    good: { name: 'Good', label: 'Within WHO guideline' },
    moderate: { name: 'Moderate', label: 'Above WHO guideline' },
    elevated: { name: 'Elevated', label: 'Above WHO guideline' },
    high: { name: 'High', label: 'Well above WHO guideline' },
    veryHigh: { name: 'Very high', label: 'Well above WHO guideline' },
    extreme: { name: 'Extreme', label: 'Beyond every WHO target' },
  },

  views: {
    tabs: 'Views',
    breath: { name: 'Breath', mouse: 'Drag to orbit · scroll to zoom', touch: 'Drag to orbit · pinch to zoom' },
    landscape: {
      name: 'Landscape',
      mouse: 'Drag to orbit · scroll to zoom · point at the terrain to read any 5 minutes',
      touch: 'Drag to orbit · pinch to zoom · tap the terrain to read any 5 minutes',
    },
    calendar: {
      name: 'Calendar',
      mouse: 'Drag to orbit · scroll to zoom · point at a day to read it',
      touch: 'Drag to orbit · pinch to zoom · tap a day to read it',
    },
    'size-mix': {
      name: 'Size mix',
      mouse: 'Drag to orbit · scroll to zoom · point at the bands to read any 5 minutes',
      touch: 'Drag to orbit · pinch to zoom · tap the bands to read any 5 minutes',
    },
    clock: {
      name: 'Clock',
      mouse: 'Drag to orbit · scroll to zoom · point at the ring to read any minute',
      touch: 'Drag to orbit · pinch to zoom · tap the ring to read any minute',
    },
    sceneLabel: (view: string, latest: string | null) =>
      `${view} view of the air-quality readings.${latest ? ` Latest PM2.5: ${latest} µg/m³.` : ''}`,
    noWebgl:
      'This browser can’t draw the 3D views because WebGL is switched off or unsupported. The readings alongside still update live.',
  },

  notes: {
    guideline: (guideline: string) =>
      `The pale sheet is the WHO 24-hour guideline, ${guideline} µg/m³. Anything poking through it is above.`,
    failed: (what: string, every: string) => `Couldn’t load ${what}. Trying again every ${every}.`,
    landscape: {
      heading: 'Landscape · last 14 days',
      body: 'Time of day runs left to right and each day is a row, with today at the front. Height and colour are PM2.5, averaged over 5 minutes. Habits show up as ridges running back through the days; one-off events as lone peaks.',
      what: 'the last 14 days',
      every: '5 minutes',
    },
    calendar: {
      heading: 'Calendar · last 26 weeks',
      body: 'One tower per day. Height and colour are the day’s mean PM2.5, which is what WHO’s 24-hour bands are defined for. Faded towers had less than half the day recorded, so their mean rests on less.',
      what: 'the daily means',
      every: '30 minutes',
    },
    sizeMix: {
      heading: 'Size mix · last 24 hours',
      body: 'The same air split by particle size and stacked. The mix hints at the source: smoke and cooking are mostly fine particles, while dust and hoovering are mostly coarse.',
    },
    clock: {
      heading: 'Clock · last 24 hours',
      body: 'A 24-hour clock of minute readings, midnight at the back. The laser sheet points at the current minute, and particles flash as they cross it. The dashed halo is the WHO guideline height.',
      fine: 'PM1 · finest and most numerous',
      mid: 'PM1 to PM2.5',
      coarse: 'PM2.5 to PM10 · settles fastest',
      foot: 'Dot counts follow the mass in each size class rather than true particle numbers.',
    },
    breath: {
      heading: 'One breath · 0.5 litre',
      caption: 'particles 0.3 µm or larger in one breath of this air',
      measured: 'Counted by the sensor over the latest minute.',
      estimated:
        'Estimated from PM2.5: this reading has no particle counts, which the sensor sends once its firmware is updated.',
      perDot: (count: string) => `Each dot stands for ${count} particles.`,
      oneDot: 'Each dot is one particle, enlarged so you can see it.',
      lodge:
        'Particles of 2.5 µm and up mostly lodge in the airways, so they’re drawn in the windpipe and bronchi; finer ones reach deep into the lungs. Each breath in carries the reading’s colour down the airways.',
      none: 'No reading yet.',
      lungs: (mean: string) =>
        `The lungs show what years of air like the last 24 hours’ average, ${mean} µg/m³, are linked to. A single day like it does no such thing.`,
      stages: {
        good: 'Healthy: clear tissue, open airways and a slow, full breath.',
        moderate: 'The first soot: dark flecks where the cells that swallow particles store them.',
        elevated: 'More soot, and the airways redden as they become inflamed.',
        high: 'Inflamed, thickened airways, the smallest ones starting to close, and quicker, shallower breaths.',
        veryHigh: 'Blackened tissue, small airways lost and fast, shallow breathing.',
        extreme: 'Heavy soot, tissue pitted as in early emphysema, laboured breathing and a cough.',
      },
      lungsFoot: 'Exaggerated so it shows. Based on links found in long-term studies of PM2.5; not a diagnosis.',
    },
  },

  sizes: {
    fine: 'smoke, cooking, traffic',
    mid: 'mixed sources',
    coarse: 'dust, pollen, hoovering',
  },

  scene: {
    now: 'now',
    today: 'Today',
    yesterday: 'Yesterday',
    soFar: ' · so far',
    highest: (value: string) => `Highest · ${value} µg/m³`,
    worstDay: (value: string) => `Worst day · ${value} µg/m³`,
    peakPm10: (value: string, time: string) => `Peak · ${value} µg/m³ PM10 at ${time}`,
    who: (guideline: string) => `WHO ${guideline}`,
    whoUnits: (guideline: string) => `WHO ${guideline} µg/m³`,
    notToScale: 'Not to scale',
    fiveMinuteMean: 'µg/m³ PM2.5 · 5-minute mean',
    dailyMean: 'µg/m³ PM2.5 · daily mean',
    minuteAverage: 'µg/m³ PM2.5 · 1-minute average',
    noFiveMinutes: 'No readings in these 5 minutes',
    noDay: 'No readings this day',
    noMinute: 'No reading this minute',
    minutesRecorded: (count: string, total: string) => `${count} of ${total} minutes recorded`,
    finePart: (percent: string) => `${percent}% of the PM10 is finer than 2.5 µm`,
    temperature: (value: string) => `Temperature ${value}`,
  },
};

export type Strings = typeof en;

export const es: Strings = {
  title: 'Calidad del aire',
  language: 'Idioma',
  place: 'Kololo, Kampala',

  about: {
    open: 'Acerca de',
    title: 'Acerca del proyecto',
    close: 'Cerrar',
    intro:
      'Un monitor de calidad del aire hecho en casa: un sensor láser de partículas, un microcontrolador y una pequeña aplicación web, midiendo el aire de mi oficina las 24 horas.',
    sections: [
      { id: 'where', heading: 'Dónde', body: 'Mi oficina en Kololo, Kampala, Uganda.' },
      {
        id: 'hardware',
        heading: 'Hardware',
        body: 'Un sensor láser Plantower PMS5003 mide PM1.0, PM2.5 y PM10, y cuenta partículas desde 0,3 µm. Un TMP36 mide la temperatura. Los dos están conectados a un microcontrolador ESP32-S3, cuyo LED RGB se ilumina con los mismos colores de banda que esta página.',
      },
      {
        id: 'device',
        heading: 'En el dispositivo',
        body: 'El firmware, escrito en Rust, lee el sensor cada 5 segundos, descarta las lecturas con checksum inválido y promedia 12 en una por minuto. Cada temperatura es el promedio de 32 muestras rápidas, para suavizar el ruido eléctrico.',
      },
      {
        id: 'pipeline',
        heading: 'Recorrido de los datos',
        body: 'Cada minuto el promedio viaja por HTTPS, verificando el certificado del servidor, a una API en un VPS que lo guarda en PostgreSQL. Esta página pide lecturas nuevas cada 30 segundos; los promedios de 5 minutos y diarios de las vistas más largas los calcula la base de datos.',
      },
    ],
    stack: 'Tecnologías',
    photo: 'La placa ESP32-S3 en una protoboard, conectada al sensor PMS5003 azul con un cable plano.',
    source: 'Código fuente en GitHub',
  },

  status: {
    connecting: 'Conectando…',
    live: (time) => `En vivo · actualizado ${time}`,
    quiet: (time) => `Sensor sin datos desde las ${time}`,
    apiRetrying: ' · la API no responde, reintentando',
    apiDown: 'No se puede conectar con la API · reintento cada 30 s',
    noReadings: 'Sin lecturas en las últimas 24 horas',
  },

  now: {
    heading: 'PM2.5 · último promedio de 1 minuto',
    whoBand: 'Banda OMS',
    temperature: 'Temperatura',
    loading: 'Cargando las últimas 24 horas…',
    empty: 'Todavía no hay lecturas. Encendé el sensor y su primer promedio de 1 minuto aparece acá en alrededor de un minuto.',
  },

  day: {
    heading: 'Últimas 24 horas',
    peak: 'Máximo',
    lowest: 'Mínimo',
    recorded: 'Registrado',
    temperature: 'Temperatura',
    at: (time) => `a las ${time}`,
    ofMinutes: (total) => `de ${total} minutos`,
    empty: 'Nada registrado en las últimas 24 horas.',
    meanUnit: 'µg/m³ PM2.5 promedio',
    within: (guideline) => `Dentro de la guía de 24 horas de la OMS (${guideline})`,
    above: (over, guideline) => `${over} por encima de la guía de 24 horas de la OMS (${guideline})`,
    bandsHeading: 'Bandas OMS · PM2.5',
    bandsNote:
      'Las bandas siguen la guía de 24 horas de la OMS (2021) para PM2.5, 15, y sus metas intermedias: 25, 37,5, 50 y 75. Están pensadas para promedios de 24 horas; las lecturas más cortas se comparan con ellas como referencia.',
  },

  bands: {
    good: { name: 'Buena', label: 'Dentro de la guía de la OMS' },
    moderate: { name: 'Moderada', label: 'Por encima de la guía de la OMS' },
    elevated: { name: 'Elevada', label: 'Por encima de la guía de la OMS' },
    high: { name: 'Alta', label: 'Muy por encima de la guía de la OMS' },
    veryHigh: { name: 'Muy alta', label: 'Muy por encima de la guía de la OMS' },
    extreme: { name: 'Extrema', label: 'Por encima de todas las metas de la OMS' },
  },

  views: {
    tabs: 'Vistas',
    breath: { name: 'Respiración', mouse: 'Arrastrá para girar · rueda para acercar', touch: 'Arrastrá para girar · pellizcá para acercar' },
    landscape: {
      name: 'Escenario',
      mouse: 'Arrastrá para girar · rueda para acercar · señalá el terreno para ver cada 5 minutos',
      touch: 'Arrastrá para girar · pellizcá para acercar · tocá el terreno para ver cada 5 minutos',
    },
    calendar: {
      name: 'Calendario',
      mouse: 'Arrastrá para girar · rueda para acercar · señalá un día para verlo',
      touch: 'Arrastrá para girar · pellizcá para acercar · tocá un día para verlo',
    },
    'size-mix': {
      name: 'Tamaños',
      mouse: 'Arrastrá para girar · rueda para acercar · señalá las bandas para ver cada 5 minutos',
      touch: 'Arrastrá para girar · pellizcá para acercar · tocá las bandas para ver cada 5 minutos',
    },
    clock: {
      name: 'Reloj',
      mouse: 'Arrastrá para girar · rueda para acercar · señalá el anillo para ver cada minuto',
      touch: 'Arrastrá para girar · pellizcá para acercar · tocá el anillo para ver cada minuto',
    },
    sceneLabel: (view, latest) =>
      `Vista ${view} de las lecturas de calidad del aire.${latest ? ` Último PM2.5: ${latest} µg/m³.` : ''}`,
    noWebgl:
      'Este navegador no puede dibujar las vistas en 3D porque WebGL está desactivado o no es compatible. Las lecturas de al lado se siguen actualizando en vivo.',
  },

  notes: {
    guideline: (guideline) =>
      `La lámina clara es la guía de 24 horas de la OMS, ${guideline} µg/m³. Todo lo que la atraviesa está por encima.`,
    failed: (what, every) => `No se pudo cargar ${what}. Se vuelve a intentar cada ${every}.`,
    landscape: {
      heading: 'Escenario · últimos 14 días',
      body: 'La hora del día va de izquierda a derecha y cada día es una fila, con hoy adelante. La altura y el color son el PM2.5, promediado cada 5 minutos. Los hábitos aparecen como crestas que recorren los días; los hechos aislados, como picos sueltos.',
      what: 'los últimos 14 días',
      every: '5 minutos',
    },
    calendar: {
      heading: 'Calendario · últimas 26 semanas',
      body: 'Una torre por día. La altura y el color son el PM2.5 promedio del día, que es para lo que están definidas las bandas de 24 horas de la OMS. Las torres atenuadas registraron menos de medio día, así que su promedio se apoya en menos datos.',
      what: 'los promedios diarios',
      every: '30 minutos',
    },
    sizeMix: {
      heading: 'Tamaños · últimas 24 horas',
      body: 'El mismo aire separado por tamaño de partícula y apilado. La mezcla da una pista sobre la fuente: el humo y la cocina son sobre todo partículas finas; el polvo y la aspiradora, sobre todo gruesas.',
    },
    clock: {
      heading: 'Reloj · últimas 24 horas',
      body: 'Un reloj de 24 horas con las lecturas de cada minuto y la medianoche atrás. La lámina láser apunta al minuto actual y las partículas destellan al cruzarla. El halo punteado marca la altura de la guía de la OMS.',
      fine: 'PM1 · las más finas y numerosas',
      mid: 'PM1 a PM2.5',
      coarse: 'PM2.5 a PM10 · las que se asientan más rápido',
      foot: 'La cantidad de puntos sigue la masa de cada tamaño, no el número real de partículas.',
    },
    breath: {
      heading: 'Una respiración · 0,5 litros',
      caption: 'partículas de 0,3 µm o más en una respiración de este aire',
      measured: 'Contadas por el sensor durante el último minuto.',
      estimated:
        'Estimado a partir del PM2.5: esta lectura no trae conteo de partículas, que el sensor envía una vez actualizado su firmware.',
      perDot: (count) => `Cada punto representa ${count} partículas.`,
      oneDot: 'Cada punto es una partícula, agrandada para que se vea.',
      lodge:
        'Las partículas de 2,5 µm o más quedan mayormente atrapadas en las vías respiratorias, por eso aparecen en la tráquea y los bronquios; las más finas llegan hasta el fondo de los pulmones. Cada inspiración lleva el color de la lectura por las vías respiratorias.',
      none: 'Todavía no hay lecturas.',
      lungs: (mean) =>
        `Los pulmones muestran lo que se asocia a años de respirar aire como el promedio de las últimas 24 horas, ${mean} µg/m³. Un solo día así no causa esto.`,
      stages: {
        good: 'Sanos: tejido limpio, vías respiratorias abiertas y una respiración lenta y profunda.',
        moderate: 'El primer hollín: manchitas oscuras donde las células que tragan partículas las guardan.',
        elevated: 'Más hollín, y las vías respiratorias se enrojecen al inflamarse.',
        high: 'Vías respiratorias inflamadas y engrosadas, las más chicas empezando a cerrarse, y respiraciones más cortas y rápidas.',
        veryHigh: 'Tejido ennegrecido, vías pequeñas perdidas y una respiración rápida y corta.',
        extreme: 'Mucho hollín, tejido picado como en un enfisema incipiente, respiración trabajosa y tos.',
      },
      lungsFoot: 'Exagerado para que se vea. Se basa en asociaciones de estudios de largo plazo sobre el PM2.5; no es un diagnóstico.',
    },
  },

  sizes: {
    fine: 'humo, cocina, tránsito',
    mid: 'fuentes mixtas',
    coarse: 'polvo, polen, aspiradora',
  },

  scene: {
    now: 'ahora',
    today: 'Hoy',
    yesterday: 'Ayer',
    soFar: ' · hasta ahora',
    highest: (value) => `Máximo · ${value} µg/m³`,
    worstDay: (value) => `Peor día · ${value} µg/m³`,
    peakPm10: (value, time) => `Pico · ${value} µg/m³ PM10 a las ${time}`,
    who: (guideline) => `OMS ${guideline}`,
    whoUnits: (guideline) => `OMS ${guideline} µg/m³`,
    notToScale: 'No está a escala',
    fiveMinuteMean: 'µg/m³ PM2.5 · promedio de 5 minutos',
    dailyMean: 'µg/m³ PM2.5 · promedio diario',
    minuteAverage: 'µg/m³ PM2.5 · promedio de 1 minuto',
    noFiveMinutes: 'Sin lecturas en estos 5 minutos',
    noDay: 'Sin lecturas este día',
    noMinute: 'Sin lectura este minuto',
    minutesRecorded: (count, total) => `${count} de ${total} minutos registrados`,
    finePart: (percent) => `El ${percent} % del PM10 es más fino que 2,5 µm`,
    temperature: (value) => `Temperatura ${value}`,
  },
};
