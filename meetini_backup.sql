--
-- PostgreSQL database dump
--

-- Dumped from database version 14.15 (Homebrew)
-- Dumped by pg_dump version 14.15 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: CalendarAccount; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."CalendarAccount" (
    id text NOT NULL,
    "userId" text NOT NULL,
    provider text NOT NULL,
    "accountId" text NOT NULL,
    "accessToken" text NOT NULL,
    "refreshToken" text,
    "expiresAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."CalendarAccount" OWNER TO toddfishman;

--
-- Name: CalendarPreferences; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."CalendarPreferences" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "workDays" integer[],
    "workingHours" jsonb,
    timezone text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."CalendarPreferences" OWNER TO toddfishman;

--
-- Name: Contact; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Contact" (
    id text NOT NULL,
    type text NOT NULL,
    value text NOT NULL,
    name text,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Contact" OWNER TO toddfishman;

--
-- Name: ContactFeedback; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."ContactFeedback" (
    id text NOT NULL,
    "userEmail" text NOT NULL,
    "contactEmail" text NOT NULL,
    action text NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ContactFeedback" OWNER TO toddfishman;

--
-- Name: Credential; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Credential" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "credentialID" text NOT NULL,
    "publicKey" text NOT NULL,
    counter integer NOT NULL,
    transports text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsed" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Credential" OWNER TO toddfishman;

--
-- Name: Group; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Group" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Group" OWNER TO toddfishman;

--
-- Name: Invitation; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Invitation" (
    id text NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    type text DEFAULT 'sent'::text NOT NULL,
    "createdBy" text NOT NULL,
    location text,
    "proposedTimes" timestamp(3) without time zone[],
    "calendarEventId" text,
    "seriesId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Invitation" OWNER TO toddfishman;

--
-- Name: Location; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Location" (
    id text NOT NULL,
    "userId" text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    address text,
    city text,
    country text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Location" OWNER TO toddfishman;

--
-- Name: LocationPreference; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."LocationPreference" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "preferencesId" text,
    "maxDistance" integer DEFAULT 5000 NOT NULL,
    "priceRange" integer[],
    "minRating" double precision DEFAULT 4.0 NOT NULL,
    "cuisineTypes" text[],
    amenities text[],
    accessibility boolean DEFAULT false NOT NULL,
    parking boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."LocationPreference" OWNER TO toddfishman;

--
-- Name: ManualEvent; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."ManualEvent" (
    id text NOT NULL,
    "userId" text NOT NULL,
    title text NOT NULL,
    start timestamp(3) without time zone NOT NULL,
    "end" timestamp(3) without time zone NOT NULL,
    location text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ManualEvent" OWNER TO toddfishman;

--
-- Name: MeetingPreferences; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."MeetingPreferences" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "locationPreferences" text NOT NULL,
    "virtualMeetings" text NOT NULL,
    "schedulingRules" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."MeetingPreferences" OWNER TO toddfishman;

--
-- Name: Participant; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Participant" (
    id text NOT NULL,
    email text NOT NULL,
    "phoneNumber" text,
    name text,
    "invitationId" text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "notifyByEmail" boolean DEFAULT true NOT NULL,
    "notifyBySms" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."Participant" OWNER TO toddfishman;

--
-- Name: Preferences; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Preferences" (
    id text NOT NULL,
    "invitationId" text NOT NULL,
    "timePreference" text,
    "durationType" text,
    "locationType" text
);


ALTER TABLE public."Preferences" OWNER TO toddfishman;

--
-- Name: Recurrence; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Recurrence" (
    id text NOT NULL,
    "invitationId" text NOT NULL,
    frequency text NOT NULL,
    "interval" integer DEFAULT 1 NOT NULL,
    "daysOfWeek" integer[],
    "endDate" timestamp(3) without time zone,
    count integer
);


ALTER TABLE public."Recurrence" OWNER TO toddfishman;

--
-- Name: Reminder; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Reminder" (
    id text NOT NULL,
    "invitationId" text NOT NULL,
    type text NOT NULL,
    "scheduledFor" timestamp(3) without time zone NOT NULL,
    sent boolean DEFAULT false NOT NULL,
    "sentAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Reminder" OWNER TO toddfishman;

--
-- Name: ReminderSetting; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."ReminderSetting" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    timing integer[],
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ReminderSetting" OWNER TO toddfishman;

--
-- Name: Response; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Response" (
    id text NOT NULL,
    "invitationId" text NOT NULL,
    "participantEmail" text NOT NULL,
    "availableTimes" timestamp(3) without time zone[],
    preferences jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Response" OWNER TO toddfishman;

--
-- Name: Series; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."Series" (
    id text NOT NULL,
    title text NOT NULL,
    "createdBy" text NOT NULL,
    "recurrenceId" text NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Series" OWNER TO toddfishman;

--
-- Name: User; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    name text,
    "phoneNumber" text,
    "notifyByEmail" boolean DEFAULT true NOT NULL,
    "notifyBySms" boolean DEFAULT false NOT NULL,
    "currentChallenge" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    image text,
    "emailVerified" timestamp(3) without time zone
);


ALTER TABLE public."User" OWNER TO toddfishman;

--
-- Name: _ContactToGroup; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."_ContactToGroup" (
    "A" text NOT NULL,
    "B" text NOT NULL
);


ALTER TABLE public."_ContactToGroup" OWNER TO toddfishman;

--
-- Name: _ReceivedInvitations; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public."_ReceivedInvitations" (
    "A" text NOT NULL,
    "B" text NOT NULL
);


ALTER TABLE public."_ReceivedInvitations" OWNER TO toddfishman;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: toddfishman
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO toddfishman;

--
-- Data for Name: CalendarAccount; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."CalendarAccount" (id, "userId", provider, "accountId", "accessToken", "refreshToken", "expiresAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: CalendarPreferences; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."CalendarPreferences" (id, "userId", "workDays", "workingHours", timezone, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Contact; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Contact" (id, type, value, name, "userId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ContactFeedback; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."ContactFeedback" (id, "userEmail", "contactEmail", action, "timestamp") FROM stdin;
\.


--
-- Data for Name: Credential; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Credential" (id, "userId", "credentialID", "publicKey", counter, transports, "createdAt", "lastUsed") FROM stdin;
\.


--
-- Data for Name: Group; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Group" (id, name, description, "userId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Invitation; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Invitation" (id, title, status, type, "createdBy", location, "proposedTimes", "calendarEventId", "seriesId", "createdAt", "updatedAt") FROM stdin;
cm89aghv80002jpf4019iuc1n	Happy Hour with Todd Fishman	pending	happy hour with Todd	toddfishman@gmail.com	\N	{}	6k5linedg5jkh7bc45heil7kdc	\N	2025-03-14 21:27:10.196	2025-03-14 21:27:10.196
cm89c9xi80001jp7tto6s5mfj	Meeting with vogt/Todd Fishman	pending	dinner with todd fishman	toddfishman@gmail.com	\N	{}	jm1ean1l7idrme1tv43043tlpc	\N	2025-03-14 22:18:03.098	2025-03-14 22:18:03.098
cm89cav920005jp7t1hyav5p5	Happy Hour with Todd Fishman	pending	happy hour with Todd fishman	toddfishman@gmail.com	\N	{}	a5i9acjqosdvhbo4sv1v73gmc0	\N	2025-03-14 22:18:46.838	2025-03-14 22:18:46.838
cm89chwy80008jp7teimmi12f	Happy Hour with Todd Fishman	pending	happy hour with Todd  Fishman	toddfishman@gmail.com	\N	{}	bqqaj9e0b6ntrapn4dlvdbdadc	\N	2025-03-14 22:24:15.632	2025-03-14 22:24:15.632
cm89cnw2q000bjp7ta73t05cd	Happy Hour with Todd Fishman	pending	happy hour with Todd Fishman	toddfishman@gmail.com	\N	{}	20tns6rjg3du89f4ih0qokvfh4	\N	2025-03-14 22:28:54.425	2025-03-14 22:28:54.425
cm89d7khv0001jp0dim0siyvu	Happy Hour with Todd Fishman	pending	happy hour with Todd  Fishman	toddfishman@gmail.com	\N	{}	2lrbq3rcmdgr6nbht64tou9j68	\N	2025-03-14 22:44:12.546	2025-03-14 22:44:12.546
cm8aqnzw10001mhdwyf0n14zv	Happy Hour with brad/TODDFISHMAN	pending	happy hour with Todd Fishman	toddfishman@gmail.com	\N	{}	7d8v6r3od3t9k4f9rkekrujcic	\N	2025-03-15 21:48:40.169	2025-03-15 21:48:40.169
cm8artpi20005mhdwrmvql9z6	Happy Hour with toddfishman/Todd Fishman	pending	happy hour with Todd@arrowfish.com	toddfishman@gmail.com	\N	{}	o7hctm5jp5cu1ifm1li00t075c	\N	2025-03-15 22:21:06.26	2025-03-15 22:21:06.26
cm8avkwtj0009mhdw0x0anzd4	Happy Hour with toddfishman/TODDFISHMAN	pending	happy hour with  Todd	toddfishman@gmail.com	\N	{}	aicjp16lg5nnbrlt5jeq6vfhn4	\N	2025-03-16 00:06:14.309	2025-03-16 00:06:14.309
cm8avwsaq000dmhdwkqe6sg8u	Happy Hour with toddfishman/todd	pending	happy hour to Todd@arrowfish.com	toddfishman@gmail.com	\N	{}	jflstsffvih93qd87j4sl8eua0	\N	2025-03-16 00:15:28.306	2025-03-16 00:15:28.306
cm8by0w0l0001mhltolo0vemj	Happy Hour with toddfishman/Hunter Brooks/Brad Cahill/Hunter Brooks	pending	happy hour with Brad  and Hunter	toddfishman@gmail.com	\N	{}	9rdipi5n6153ds38h0qi0sp9ag	\N	2025-03-16 18:02:25.172	2025-03-16 18:02:25.172
\.


--
-- Data for Name: Location; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Location" (id, "userId", latitude, longitude, address, city, country, "updatedAt") FROM stdin;
\.


--
-- Data for Name: LocationPreference; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."LocationPreference" (id, "userId", "preferencesId", "maxDistance", "priceRange", "minRating", "cuisineTypes", amenities, accessibility, parking, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ManualEvent; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."ManualEvent" (id, "userId", title, start, "end", location, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: MeetingPreferences; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."MeetingPreferences" (id, "userId", "locationPreferences", "virtualMeetings", "schedulingRules", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Participant; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Participant" (id, email, "phoneNumber", name, "invitationId", status, "notifyByEmail", "notifyBySms") FROM stdin;
cm89aghv80003jpf45kn4c3o4	TODDFISHMAN@gmail.com	\N	Todd Fishman	cm89aghv80002jpf4019iuc1n	pending	t	f
cm89c9xi80002jp7tq1j64ex4	vogt@gmail.com	\N	vogt	cm89c9xi80001jp7tto6s5mfj	pending	t	f
cm89c9xi80003jp7tvmka78kh	todd@arrowfish.com	\N	Todd Fishman	cm89c9xi80001jp7tto6s5mfj	pending	t	f
cm89cav920006jp7tifeo9dg0	todd@arrowfish.com	\N	Todd Fishman	cm89cav920005jp7t1hyav5p5	pending	t	f
cm89chwy80009jp7tscbynpuo	todd@arrowfish.com	\N	Todd Fishman	cm89chwy80008jp7teimmi12f	pending	t	f
cm89cnw2q000cjp7tsv99bq6y	todd@arrowfish.com	\N	Todd Fishman	cm89cnw2q000bjp7ta73t05cd	pending	t	f
cm89d7khw0002jp0decv3cayt	todd@arrowfish.com	\N	Todd Fishman	cm89d7khv0001jp0dim0siyvu	pending	t	f
cm8aqnzw10002mhdwrgwtz0zx	brad@realresidential.com	\N	brad	cm8aqnzw10001mhdwyf0n14zv	pending	t	f
cm8aqnzw10003mhdwcgo1mzqb	TODDFISHMAN@gmail.com	\N	TODDFISHMAN	cm8aqnzw10001mhdwyf0n14zv	pending	t	f
cm8artpi20006mhdwjmm56imx	toddfishman@gmail.com	\N	toddfishman	cm8artpi20005mhdwrmvql9z6	pending	f	f
cm8artpi20007mhdwpxupg8vq	todd@arrowfish.com	\N	Todd Fishman	cm8artpi20005mhdwrmvql9z6	pending	t	f
cm8avkwtj000amhdw98tup5mv	toddfishman@gmail.com	\N	toddfishman	cm8avkwtj0009mhdw0x0anzd4	pending	f	f
cm8avkwtj000bmhdw9fa1ycuf	TODDFISHMAN@gmail.com	\N	TODDFISHMAN	cm8avkwtj0009mhdw0x0anzd4	pending	t	f
cm8avwsaq000emhdw90sdw2id	toddfishman@gmail.com	\N	toddfishman	cm8avwsaq000dmhdwkqe6sg8u	pending	f	f
cm8avwsaq000fmhdwwsdgb1tn	todd@arrowfish.com	\N	todd	cm8avwsaq000dmhdwkqe6sg8u	pending	t	f
cm8by0w0l0002mhltaa7ys4ep	toddfishman@gmail.com	\N	toddfishman	cm8by0w0l0001mhltolo0vemj	pending	f	f
cm8by0w0l0003mhltjzh9777l	hbbrooks@gmail.com	\N	Hunter Brooks	cm8by0w0l0001mhltolo0vemj	pending	t	f
cm8by0w0l0004mhlty81w4gdj	brad@realresidential.com	\N	Brad Cahill	cm8by0w0l0001mhltolo0vemj	pending	t	f
cm8by0w0l0005mhltuwzkwbv9	hunter@arrowfish.com	\N	Hunter Brooks	cm8by0w0l0001mhltolo0vemj	pending	t	f
\.


--
-- Data for Name: Preferences; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Preferences" (id, "invitationId", "timePreference", "durationType", "locationType") FROM stdin;
\.


--
-- Data for Name: Recurrence; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Recurrence" (id, "invitationId", frequency, "interval", "daysOfWeek", "endDate", count) FROM stdin;
\.


--
-- Data for Name: Reminder; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Reminder" (id, "invitationId", type, "scheduledFor", sent, "sentAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: ReminderSetting; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."ReminderSetting" (id, "userId", type, timing, enabled, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Response; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Response" (id, "invitationId", "participantEmail", "availableTimes", preferences, "createdAt") FROM stdin;
\.


--
-- Data for Name: Series; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."Series" (id, title, "createdBy", "recurrenceId", "startDate", "endDate", "createdAt") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."User" (id, email, name, "phoneNumber", "notifyByEmail", "notifyBySms", "currentChallenge", "createdAt", "updatedAt", image, "emailVerified") FROM stdin;
cm89afzuj0000jpf4fg5qwk9w	toddfishman@gmail.com	Todd Fishman	\N	t	f	\N	2025-03-14 21:26:46.844	2025-03-14 21:26:46.844	https://lh3.googleusercontent.com/a/ACg8ocKNeE2brqxD6yxkje1bMYnogBfoO0VbZmAfvjD00bEBInV5kA=s96-c	\N
\.


--
-- Data for Name: _ContactToGroup; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."_ContactToGroup" ("A", "B") FROM stdin;
\.


--
-- Data for Name: _ReceivedInvitations; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public."_ReceivedInvitations" ("A", "B") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: toddfishman
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
31075296-3583-4cd4-9bf0-7dbce600420c	9cd66b55f9beec037216d096ac312adea15a76e00a76cf8e938378411e15957b	2025-03-14 14:01:04.076546-07	20250130205346_add_calendar_event_id	\N	\N	2025-03-14 14:01:04.056821-07	1
e7e6041a-db2a-43fc-bcc7-efa2d18511be	8c9809943c91948f8269223c7d8c3d0577a520e95b4583976534012ee4d11285	2025-03-14 14:01:04.078538-07	20250131212946_add_meeting_preferences	\N	\N	2025-03-14 14:01:04.076797-07	1
66d58177-0fb3-4a78-9247-ea36a9ed75d0	6ce1183d741294cc2189bd95f271efaf5346dcfeaa77ebea8c3d5f19dd47e5a7	2025-03-15 18:26:09.845645-07	20250316012609_add_contact_feedback	\N	\N	2025-03-15 18:26:09.840329-07	1
\.


--
-- Name: CalendarAccount CalendarAccount_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."CalendarAccount"
    ADD CONSTRAINT "CalendarAccount_pkey" PRIMARY KEY (id);


--
-- Name: CalendarPreferences CalendarPreferences_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."CalendarPreferences"
    ADD CONSTRAINT "CalendarPreferences_pkey" PRIMARY KEY (id);


--
-- Name: ContactFeedback ContactFeedback_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."ContactFeedback"
    ADD CONSTRAINT "ContactFeedback_pkey" PRIMARY KEY (id);


--
-- Name: Contact Contact_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_pkey" PRIMARY KEY (id);


--
-- Name: Credential Credential_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Credential"
    ADD CONSTRAINT "Credential_pkey" PRIMARY KEY (id);


--
-- Name: Group Group_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Group"
    ADD CONSTRAINT "Group_pkey" PRIMARY KEY (id);


--
-- Name: Invitation Invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_pkey" PRIMARY KEY (id);


--
-- Name: LocationPreference LocationPreference_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."LocationPreference"
    ADD CONSTRAINT "LocationPreference_pkey" PRIMARY KEY (id);


--
-- Name: Location Location_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Location"
    ADD CONSTRAINT "Location_pkey" PRIMARY KEY (id);


--
-- Name: ManualEvent ManualEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."ManualEvent"
    ADD CONSTRAINT "ManualEvent_pkey" PRIMARY KEY (id);


--
-- Name: MeetingPreferences MeetingPreferences_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."MeetingPreferences"
    ADD CONSTRAINT "MeetingPreferences_pkey" PRIMARY KEY (id);


--
-- Name: Participant Participant_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Participant"
    ADD CONSTRAINT "Participant_pkey" PRIMARY KEY (id);


--
-- Name: Preferences Preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Preferences"
    ADD CONSTRAINT "Preferences_pkey" PRIMARY KEY (id);


--
-- Name: Recurrence Recurrence_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Recurrence"
    ADD CONSTRAINT "Recurrence_pkey" PRIMARY KEY (id);


--
-- Name: ReminderSetting ReminderSetting_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."ReminderSetting"
    ADD CONSTRAINT "ReminderSetting_pkey" PRIMARY KEY (id);


--
-- Name: Reminder Reminder_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Reminder"
    ADD CONSTRAINT "Reminder_pkey" PRIMARY KEY (id);


--
-- Name: Response Response_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Response"
    ADD CONSTRAINT "Response_pkey" PRIMARY KEY (id);


--
-- Name: Series Series_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Series"
    ADD CONSTRAINT "Series_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _ContactToGroup _ContactToGroup_AB_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."_ContactToGroup"
    ADD CONSTRAINT "_ContactToGroup_AB_pkey" PRIMARY KEY ("A", "B");


--
-- Name: _ReceivedInvitations _ReceivedInvitations_AB_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."_ReceivedInvitations"
    ADD CONSTRAINT "_ReceivedInvitations_AB_pkey" PRIMARY KEY ("A", "B");


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: CalendarAccount_userId_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "CalendarAccount_userId_idx" ON public."CalendarAccount" USING btree ("userId");


--
-- Name: CalendarAccount_userId_provider_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "CalendarAccount_userId_provider_key" ON public."CalendarAccount" USING btree ("userId", provider);


--
-- Name: CalendarPreferences_userId_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "CalendarPreferences_userId_key" ON public."CalendarPreferences" USING btree ("userId");


--
-- Name: ContactFeedback_contactEmail_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "ContactFeedback_contactEmail_idx" ON public."ContactFeedback" USING btree ("contactEmail");


--
-- Name: ContactFeedback_userEmail_contactEmail_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "ContactFeedback_userEmail_contactEmail_key" ON public."ContactFeedback" USING btree ("userEmail", "contactEmail");


--
-- Name: ContactFeedback_userEmail_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "ContactFeedback_userEmail_idx" ON public."ContactFeedback" USING btree ("userEmail");


--
-- Name: Contact_userId_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "Contact_userId_idx" ON public."Contact" USING btree ("userId");


--
-- Name: Contact_userId_type_value_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "Contact_userId_type_value_key" ON public."Contact" USING btree ("userId", type, value);


--
-- Name: Credential_credentialID_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "Credential_credentialID_key" ON public."Credential" USING btree ("credentialID");


--
-- Name: Credential_userId_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "Credential_userId_idx" ON public."Credential" USING btree ("userId");


--
-- Name: Group_userId_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "Group_userId_idx" ON public."Group" USING btree ("userId");


--
-- Name: Invitation_createdBy_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "Invitation_createdBy_idx" ON public."Invitation" USING btree ("createdBy");


--
-- Name: Invitation_status_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "Invitation_status_idx" ON public."Invitation" USING btree (status);


--
-- Name: Invitation_type_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "Invitation_type_idx" ON public."Invitation" USING btree (type);


--
-- Name: Location_userId_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "Location_userId_key" ON public."Location" USING btree ("userId");


--
-- Name: ManualEvent_start_end_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "ManualEvent_start_end_idx" ON public."ManualEvent" USING btree (start, "end");


--
-- Name: ManualEvent_userId_idx; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "ManualEvent_userId_idx" ON public."ManualEvent" USING btree ("userId");


--
-- Name: MeetingPreferences_userId_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "MeetingPreferences_userId_key" ON public."MeetingPreferences" USING btree ("userId");


--
-- Name: Preferences_invitationId_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "Preferences_invitationId_key" ON public."Preferences" USING btree ("invitationId");


--
-- Name: Recurrence_invitationId_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "Recurrence_invitationId_key" ON public."Recurrence" USING btree ("invitationId");


--
-- Name: Series_recurrenceId_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "Series_recurrenceId_key" ON public."Series" USING btree ("recurrenceId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: _ContactToGroup_B_index; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "_ContactToGroup_B_index" ON public."_ContactToGroup" USING btree ("B");


--
-- Name: _ReceivedInvitations_B_index; Type: INDEX; Schema: public; Owner: toddfishman
--

CREATE INDEX "_ReceivedInvitations_B_index" ON public."_ReceivedInvitations" USING btree ("B");


--
-- Name: CalendarAccount CalendarAccount_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."CalendarAccount"
    ADD CONSTRAINT "CalendarAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CalendarPreferences CalendarPreferences_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."CalendarPreferences"
    ADD CONSTRAINT "CalendarPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ContactFeedback ContactFeedback_userEmail_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."ContactFeedback"
    ADD CONSTRAINT "ContactFeedback_userEmail_fkey" FOREIGN KEY ("userEmail") REFERENCES public."User"(email) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Contact Contact_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Credential Credential_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Credential"
    ADD CONSTRAINT "Credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Group Group_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Group"
    ADD CONSTRAINT "Group_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Invitation Invitation_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(email) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Invitation Invitation_seriesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES public."Series"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LocationPreference LocationPreference_preferencesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."LocationPreference"
    ADD CONSTRAINT "LocationPreference_preferencesId_fkey" FOREIGN KEY ("preferencesId") REFERENCES public."Preferences"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LocationPreference LocationPreference_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."LocationPreference"
    ADD CONSTRAINT "LocationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Location Location_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Location"
    ADD CONSTRAINT "Location_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ManualEvent ManualEvent_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."ManualEvent"
    ADD CONSTRAINT "ManualEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MeetingPreferences MeetingPreferences_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."MeetingPreferences"
    ADD CONSTRAINT "MeetingPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Participant Participant_invitationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Participant"
    ADD CONSTRAINT "Participant_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES public."Invitation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Preferences Preferences_invitationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Preferences"
    ADD CONSTRAINT "Preferences_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES public."Invitation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Recurrence Recurrence_invitationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Recurrence"
    ADD CONSTRAINT "Recurrence_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES public."Invitation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ReminderSetting ReminderSetting_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."ReminderSetting"
    ADD CONSTRAINT "ReminderSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Reminder Reminder_invitationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Reminder"
    ADD CONSTRAINT "Reminder_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES public."Invitation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Response Response_invitationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Response"
    ADD CONSTRAINT "Response_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES public."Invitation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Series Series_recurrenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."Series"
    ADD CONSTRAINT "Series_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES public."Recurrence"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: _ContactToGroup _ContactToGroup_A_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."_ContactToGroup"
    ADD CONSTRAINT "_ContactToGroup_A_fkey" FOREIGN KEY ("A") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _ContactToGroup _ContactToGroup_B_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."_ContactToGroup"
    ADD CONSTRAINT "_ContactToGroup_B_fkey" FOREIGN KEY ("B") REFERENCES public."Group"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _ReceivedInvitations _ReceivedInvitations_A_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."_ReceivedInvitations"
    ADD CONSTRAINT "_ReceivedInvitations_A_fkey" FOREIGN KEY ("A") REFERENCES public."Invitation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _ReceivedInvitations _ReceivedInvitations_B_fkey; Type: FK CONSTRAINT; Schema: public; Owner: toddfishman
--

ALTER TABLE ONLY public."_ReceivedInvitations"
    ADD CONSTRAINT "_ReceivedInvitations_B_fkey" FOREIGN KEY ("B") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

