# SmartCommute - Diagrams (Mermaid)

Render in GitHub, VS Code (Markdown Preview Mermaid), https://mermaid.live, or export to PNG for the report.

## 1. System flowchart
```mermaid
flowchart TD
    A([Start: main.m]) --> B{Dataset cached?}
    B -- no --> C[generateTrafficData<br/>12,000 records]
    B -- yes --> D[Load traffic_data.mat]
    C --> D
    D --> E[Descriptive stats + outliers]
    E --> F[Fit Normal / Lognormal / Gamma / Weibull<br/>rank by AIC]
    F --> G[Probability module<br/>conditional + Bayes]
    G --> H[Inference: CI, t-test, chi-square, ANOVA]
    H --> I[Correlation + Regression]
    I --> J[/User selects scenario:<br/>route, day, time, weather, traffic, deadline/]
    J --> K[selectScenario: conditional sample]
    K --> L[fitDistributions: best-AIC law]
    L --> M[Random sampling: 10,000 journeys]
    M --> N[Risk estimation:<br/>P late, CI, risk score]
    N --> O[recommendDeparture:<br/>latest time with P late <= tolerance]
    O --> P[Dashboard charts, map, PDF reports]
    P --> Q([End])
```

## 2. Data-flow diagram - Level 0 (context)
```mermaid
flowchart LR
    U[Commuter / Analyst] -- scenario inputs, tolerance --> S((SmartCommute<br/>System))
    D[(Historical traffic data<br/>CSV / synthetic)] -- records --> S
    S -- probabilities, CI, risk score, departure time --> U
    S -- PDF reports --> R[Report files]
```

## 3. Data-flow diagram - Level 1
```mermaid
flowchart LR
    U[Commuter] -->|inputs| P5
    D1[(D1 Traffic dataset)] --> P1[1.0 Data management<br/>generate / import / validate]
    P1 --> P2[2.0 Statistical analysis<br/>describe, outliers, fit, correlate, regress]
    P2 --> D2[(D2 Model store<br/>fits, tests, coefficients)]
    D1 --> P3[3.0 Probability & inference<br/>P(TT>t), conditional, CI, tests]
    P3 --> D2
    D2 --> P4[4.0 Scenario selection]
    D1 --> P4
    P4 --> P5[5.0 Monte Carlo engine<br/>sample, simulate, risk score]
    P5 --> P6[6.0 Departure recommender]
    P5 --> P7[7.0 Visualisation & map]
    P6 --> P7
    P5 --> P8[8.0 Report generator]
    P2 --> P8
    P3 --> P8
    P6 --> P8
    P7 -->|dashboard| U
    P8 -->|PDF| U
```

## 4. Use-case diagram
```mermaid
flowchart LR
    Commuter([Commuter])
    Analyst([Traffic analyst])
    Student([Student / examiner])
    subgraph SmartCommute
        UC1(View overview dashboard)
        UC2(Explore delay probabilities)
        UC3(Run Monte Carlo simulation)
        UC4(Get departure recommendation)
        UC5(Inspect route risk map)
        UC6(Analyse distributions & tests)
        UC7(Generate PDF report)
        UC8(Import / export dataset)
        UC9(Compare with navigation apps)
    end
    Commuter --- UC1 & UC2 & UC3 & UC4 & UC5
    Analyst --- UC2 & UC6 & UC7 & UC8
    Student --- UC6 & UC9 & UC3
    UC3 -. include .-> UC6
    UC4 -. include .-> UC3
    UC7 -. extend .-> UC4
```

## 5. Architecture diagram
```mermaid
flowchart TB
    subgraph UI[Interface - app/web, one uihtml component]
        U1[Leaflet map: road / satellite / terrain / hybrid]
        U2[Floating cards: planner, result, settings, profile]
        U3[Canvas charts: histogram, probability curve, gauge, departure curve]
        U4[Services: place search, OSRM routing, Open-Meteo weather]
    end
    subgraph Shell[MATLAB shell - app/SmartCommuteApp.m]
        S1[Event bridge: ready / analyze / report]
    end
    subgraph Engine[Scientific engine - src/engine]
        E1[analyzeRoute]
        E2[ratioModel + ratioSample]
        E3[weatherTarget + regression shift]
        E4[ratioDepartureScan]
        E5[routeDrivers]
    end
    subgraph Analytics[Statistics - src/stats]
        A1[fitDistributions: AIC / BIC / KS]
        A2[probability, inference, correlation, regression]
    end
    subgraph Data[Data - src/core, data/]
        D1[generateTrafficData]
        D2[(traffic_data.mat)]
    end
    subgraph Rep[Reports - src/reports]
        R1[generateReport: 4 PDFs]
    end
    U4 --> U2
    U2 -- analyze request --> S1
    S1 --> E1
    E1 --> E2 --> D2
    E1 --> E3
    E1 --> A1
    E1 --> E4
    E1 --> E5
    S1 -- result JSON --> U3
    S1 --> R1
    R1 --> A2
    D1 --> D2
```

## 6. ER diagram
```mermaid
erDiagram
    ROUTE ||--o{ TRIP_RECORD : "is taken on"
    WEATHER ||--o{ TRIP_RECORD : "prevails during"
    CALENDAR_DAY ||--o{ TRIP_RECORD : "contains"
    TRIP_RECORD ||--o{ SIMULATION_RUN : "conditions"
    SIMULATION_RUN ||--|| RECOMMENDATION : "produces"
    ROUTE {
        string RouteID PK
        string Name
        double DistanceKm
        double FreeFlowKmh
        int Capacity
    }
    WEATHER {
        string WeatherCondition PK
        double Rainfall
        double Visibility
        double Temperature
    }
    CALENDAR_DAY {
        date Date PK
        string DayOfWeek
        bool IsWeekend
    }
    TRIP_RECORD {
        int RecordID PK
        date Date FK
        string RouteID FK
        string WeatherCondition FK
        double DepartureTime
        double TrafficVolume
        double AverageSpeed
        double TravelTime
        double CongestionIndex
        double VCRatio
        string Density
        bool IsPeak
    }
    SIMULATION_RUN {
        int RunID PK
        string RouteID
        string DayType
        double Hour
        string Weather
        int N
        string BestFit
        double MeanTT
        double PLate
        double RiskScore
    }
    RECOMMENDATION {
        int RunID FK
        double Deadline
        double Tolerance
        double BestDeparture
        double BestPLate
    }
```
