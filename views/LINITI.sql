

CREATE TABLE IF NOT EXISTS public.accounts
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    total_balance numeric(12, 2) DEFAULT 0.00,
    CONSTRAINT accounts_pkey PRIMARY KEY (id),
    CONSTRAINT accounts_user_id_key UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.categories
(
    id serial NOT NULL,
    name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    parent_id integer,
    CONSTRAINT categories_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.chats
(
    id serial NOT NULL,
    user1_id integer NOT NULL,
    user2_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chats_pkey PRIMARY KEY (id),
    CONSTRAINT chats_user1_id_user2_id_key UNIQUE (user1_id, user2_id)
);

CREATE TABLE IF NOT EXISTS public.collection_works
(
    id serial NOT NULL,
    collection_id integer NOT NULL,
    work_id integer NOT NULL,
    sort_order integer DEFAULT 0,
    added_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT collection_works_pkey PRIMARY KEY (id),
    CONSTRAINT collection_works_collection_id_work_id_key UNIQUE (collection_id, work_id)
);

CREATE TABLE IF NOT EXISTS public.complaint_reasons
(
    id serial NOT NULL,
    name character varying(150) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT complaint_reasons_pkey PRIMARY KEY (id),
    CONSTRAINT complaint_reasons_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.complaints
(
    id serial NOT NULL,
    sender_id integer NOT NULL,
    work_id integer NOT NULL,
    reason_id integer NOT NULL,
    status character varying(50) COLLATE pg_catalog."default" DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT complaints_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.deal_proposal_stages
(
    id serial NOT NULL,
    proposal_id integer NOT NULL,
    title character varying(255) COLLATE pg_catalog."default" NOT NULL,
    deadline date,
    sort_order integer NOT NULL DEFAULT 0,
    CONSTRAINT deal_proposal_stages_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.deal_proposals
(
    id serial NOT NULL,
    sender_id integer NOT NULL,
    recipient_id integer NOT NULL,
    target_type character varying(20) COLLATE pg_catalog."default",
    target_id integer,
    price numeric(12, 2) NOT NULL DEFAULT 0,
    deadline date,
    status character varying(20) COLLATE pg_catalog."default" NOT NULL DEFAULT 'pending'::character varying,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at timestamp without time zone,
    CONSTRAINT deal_proposals_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.feedback
(
    id serial NOT NULL,
    name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    email character varying(100) COLLATE pg_catalog."default" NOT NULL,
    message text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT feedback_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.message_drafts
(
    id serial NOT NULL,
    chat_id integer NOT NULL,
    user_id integer NOT NULL,
    draft_text text COLLATE pg_catalog."default",
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT message_drafts_pkey PRIMARY KEY (id),
    CONSTRAINT message_drafts_chat_id_user_id_key UNIQUE (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages
(
    id serial NOT NULL,
    chat_id integer NOT NULL,
    sender_id integer NOT NULL,
    message text COLLATE pg_catalog."default" NOT NULL,
    is_read boolean DEFAULT false,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    file_url text COLLATE pg_catalog."default",
    file_name text COLLATE pg_catalog."default",
    file_mime text COLLATE pg_catalog."default",
    file_size bigint,
    message_type character varying(20) COLLATE pg_catalog."default" DEFAULT 'text'::character varying,
    metadata jsonb,
    CONSTRAINT messages_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.notifications
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    message text COLLATE pg_catalog."default" NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    link text COLLATE pg_catalog."default",
    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.order_categories
(
    order_id integer NOT NULL,
    category_id integer NOT NULL,
    CONSTRAINT order_categories_pkey PRIMARY KEY (order_id, category_id)
);

CREATE TABLE IF NOT EXISTS public.order_files
(
    id serial NOT NULL,
    order_id integer NOT NULL,
    file_url text COLLATE pg_catalog."default" NOT NULL,
    original_name text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_files_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.order_reviews
(
    id serial NOT NULL,
    order_id integer NOT NULL,
    reviewer_id integer NOT NULL,
    rating integer NOT NULL,
    comment text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_reviews_pkey PRIMARY KEY (id),
    CONSTRAINT order_reviews_order_id_reviewer_id_key UNIQUE (order_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS public.order_stage_change_requests
(
    id serial NOT NULL,
    order_id integer NOT NULL,
    executor_id integer NOT NULL,
    customer_id integer NOT NULL,
    stages jsonb NOT NULL,
    status character varying(20) COLLATE pg_catalog."default" NOT NULL DEFAULT 'pending'::character varying,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at timestamp without time zone,
    CONSTRAINT order_stage_change_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.order_stages
(
    id serial NOT NULL,
    order_id integer NOT NULL,
    name character varying(150) COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    sort_order integer DEFAULT 0,
    completed boolean DEFAULT false,
    completed_at timestamp without time zone,
    deadline date,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_stages_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.orders
(
    id serial NOT NULL,
    customer_id integer NOT NULL,
    executor_id integer,
    title character varying(200) COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    price numeric(10, 2) NOT NULL,
    status character varying(50) COLLATE pg_catalog."default" DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone,
    deadline date,
    payment_status character varying(20) COLLATE pg_catalog."default" DEFAULT 'pending'::character varying,
    customer_confirmed boolean DEFAULT false,
    executor_confirmed boolean DEFAULT false,
    fee_amount numeric(12, 2) DEFAULT 0,
    fee_recipient_id integer,
    platform_fee_rate numeric(5, 4) DEFAULT 0.03,
    CONSTRAINT orders_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.payments
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    amount numeric(12, 2) NOT NULL DEFAULT 0,
    status character varying(20) COLLATE pg_catalog."default" NOT NULL DEFAULT 'pending'::character varying,
    yookassa_payment_id character varying(100) COLLATE pg_catalog."default",
    metadata jsonb,
    description text COLLATE pg_catalog."default",
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payments_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.platform_stats
(
    id serial NOT NULL,
    total_users integer DEFAULT 0,
    total_works integer DEFAULT 0,
    total_orders integer DEFAULT 0,
    total_revenue numeric(12, 2) DEFAULT 0,
    active_users_today integer DEFAULT 0,
    new_users_today integer DEFAULT 0,
    date date NOT NULL,
    CONSTRAINT platform_stats_pkey PRIMARY KEY (id),
    CONSTRAINT platform_stats_date_key UNIQUE (date)
);

CREATE TABLE IF NOT EXISTS public.project_collections
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    title character varying(150) COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT project_collections_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.roles
(
    id serial NOT NULL,
    name character varying(50) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT roles_pkey PRIMARY KEY (id),
    CONSTRAINT roles_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.service_categories
(
    service_id integer NOT NULL,
    category_id integer NOT NULL,
    CONSTRAINT service_categories_pkey PRIMARY KEY (service_id, category_id)
);

CREATE TABLE IF NOT EXISTS public.service_reviews
(
    id serial NOT NULL,
    reviewer_id integer NOT NULL,
    service_id integer NOT NULL,
    rating integer NOT NULL,
    comment text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT service_reviews_pkey PRIMARY KEY (id),
    CONSTRAINT service_reviews_reviewer_id_service_id_key UNIQUE (reviewer_id, service_id)
);

CREATE TABLE IF NOT EXISTS public.services
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    title character varying(150) COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    category_id integer,
    price_from numeric(10, 2),
    price_to numeric(10, 2),
    execution_days integer NOT NULL DEFAULT 1,
    avg_rating numeric(3, 1) DEFAULT 0.00,
    total_reviews integer DEFAULT 0,
    start_date date NOT NULL,
    deadline date NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(50) COLLATE pg_catalog."default" DEFAULT 'active'::character varying,
    provider_id integer,
    source_order_id integer,
    price numeric(12, 2) NOT NULL DEFAULT 0,
    cover_image text COLLATE pg_catalog."default",
    CONSTRAINT services_pkey PRIMARY KEY (id),
    CONSTRAINT services_source_order_id_key UNIQUE (source_order_id)
);

CREATE TABLE IF NOT EXISTS public.subscriptions
(
    id serial NOT NULL,
    follower_id integer NOT NULL,
    followed_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT subscriptions_follower_id_followed_id_key UNIQUE (follower_id, followed_id)
);

CREATE TABLE IF NOT EXISTS public.system_settings
(
    key character varying(100) COLLATE pg_catalog."default" NOT NULL,
    value text COLLATE pg_catalog."default",
    description text COLLATE pg_catalog."default",
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT system_settings_pkey PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS public.transactions
(
    id serial NOT NULL,
    account_id integer NOT NULL,
    amount numeric(12, 2) NOT NULL,
    type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    description character varying(255) COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT transactions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_activity_logs
(
    id serial NOT NULL,
    user_id integer,
    action character varying(100) COLLATE pg_catalog."default" NOT NULL,
    details jsonb,
    ip_address inet,
    user_agent text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_activity_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_balances
(
    user_id integer NOT NULL,
    balance numeric(12, 2) NOT NULL DEFAULT 0,
    held_balance numeric(12, 2) NOT NULL DEFAULT 0,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_balances_pkey PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS public.user_reviews
(
    id serial NOT NULL,
    reviewer_id integer NOT NULL,
    reviewed_user_id integer NOT NULL,
    rating integer NOT NULL,
    comment text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_reviews_pkey PRIMARY KEY (id),
    CONSTRAINT user_reviews_reviewer_id_reviewed_user_id_key UNIQUE (reviewer_id, reviewed_user_id)
);

CREATE TABLE IF NOT EXISTS public.users
(
    id serial NOT NULL,
    first_name character varying(50) COLLATE pg_catalog."default" NOT NULL,
    last_name character varying(50) COLLATE pg_catalog."default",
    email character varying(100) COLLATE pg_catalog."default" NOT NULL,
    password_hash character varying(255) COLLATE pg_catalog."default" NOT NULL,
    avatar character varying(255) COLLATE pg_catalog."default",
    bio text COLLATE pg_catalog."default",
    role_id integer NOT NULL DEFAULT 2,
    avg_rating numeric(3, 1) DEFAULT 0.00,
    total_reviews integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.withdrawal_requests
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    amount numeric(12, 2) NOT NULL DEFAULT 0,
    status character varying(20) COLLATE pg_catalog."default" NOT NULL DEFAULT 'pending'::character varying,
    payment_method character varying(20) COLLATE pg_catalog."default" NOT NULL DEFAULT 'card'::character varying,
    details text COLLATE pg_catalog."default" NOT NULL DEFAULT ''::text,
    bank_id character varying(50) COLLATE pg_catalog."default",
    rejection_reason text COLLATE pg_catalog."default",
    payout_error text COLLATE pg_catalog."default",
    processed_by integer,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp without time zone,
    CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.work_categories
(
    id serial NOT NULL,
    work_id integer NOT NULL,
    category_id integer NOT NULL,
    CONSTRAINT work_categories_pkey PRIMARY KEY (id),
    CONSTRAINT work_categories_work_id_category_id_key UNIQUE (work_id, category_id)
);

CREATE TABLE IF NOT EXISTS public.work_images
(
    id serial NOT NULL,
    work_id integer NOT NULL,
    image_url character varying(255) COLLATE pg_catalog."default" NOT NULL,
    sort_order integer DEFAULT 0,
    CONSTRAINT work_images_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.work_likes
(
    work_id integer NOT NULL,
    user_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT work_likes_pkey PRIMARY KEY (work_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.works
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    title character varying(150) COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    status character varying(50) COLLATE pg_catalog."default" DEFAULT 'active'::character varying,
    likes integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT works_pkey PRIMARY KEY (id)
);

ALTER TABLE IF EXISTS public.accounts
    ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS accounts_user_id_key
    ON public.accounts(user_id);


ALTER TABLE IF EXISTS public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id)
    REFERENCES public.categories (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE SET NULL;


ALTER TABLE IF EXISTS public.chats
    ADD CONSTRAINT chats_user1_id_fkey FOREIGN KEY (user1_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_chats_user1
    ON public.chats(user1_id);


ALTER TABLE IF EXISTS public.chats
    ADD CONSTRAINT chats_user2_id_fkey FOREIGN KEY (user2_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_chats_user2
    ON public.chats(user2_id);


ALTER TABLE IF EXISTS public.collection_works
    ADD CONSTRAINT collection_works_collection_id_fkey FOREIGN KEY (collection_id)
    REFERENCES public.project_collections (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_collection_works_collection_id
    ON public.collection_works(collection_id);


ALTER TABLE IF EXISTS public.collection_works
    ADD CONSTRAINT collection_works_work_id_fkey FOREIGN KEY (work_id)
    REFERENCES public.works (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_collection_works_work_id
    ON public.collection_works(work_id);


ALTER TABLE IF EXISTS public.complaints
    ADD CONSTRAINT complaints_reason_id_fkey FOREIGN KEY (reason_id)
    REFERENCES public.complaint_reasons (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION;


ALTER TABLE IF EXISTS public.complaints
    ADD CONSTRAINT complaints_sender_id_fkey FOREIGN KEY (sender_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_complaints_sender_id
    ON public.complaints(sender_id);


ALTER TABLE IF EXISTS public.complaints
    ADD CONSTRAINT complaints_work_id_fkey FOREIGN KEY (work_id)
    REFERENCES public.works (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_complaints_work_id
    ON public.complaints(work_id);


ALTER TABLE IF EXISTS public.deal_proposal_stages
    ADD CONSTRAINT deal_proposal_stages_proposal_id_fkey FOREIGN KEY (proposal_id)
    REFERENCES public.deal_proposals (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.deal_proposals
    ADD CONSTRAINT deal_proposals_recipient_id_fkey FOREIGN KEY (recipient_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.deal_proposals
    ADD CONSTRAINT deal_proposals_sender_id_fkey FOREIGN KEY (sender_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.message_drafts
    ADD CONSTRAINT message_drafts_chat_id_fkey FOREIGN KEY (chat_id)
    REFERENCES public.chats (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.message_drafts
    ADD CONSTRAINT message_drafts_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_message_drafts_user
    ON public.message_drafts(user_id);


ALTER TABLE IF EXISTS public.messages
    ADD CONSTRAINT messages_chat_id_fkey FOREIGN KEY (chat_id)
    REFERENCES public.chats (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_chat_id
    ON public.messages(chat_id);


ALTER TABLE IF EXISTS public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_sender_id
    ON public.messages(sender_id);


ALTER TABLE IF EXISTS public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON public.notifications(user_id);


ALTER TABLE IF EXISTS public.order_categories
    ADD CONSTRAINT order_categories_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES public.categories (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.order_categories
    ADD CONSTRAINT order_categories_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.order_files
    ADD CONSTRAINT order_files_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.order_reviews
    ADD CONSTRAINT order_reviews_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_order_reviews_order
    ON public.order_reviews(order_id);


ALTER TABLE IF EXISTS public.order_reviews
    ADD CONSTRAINT order_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.order_stage_change_requests
    ADD CONSTRAINT order_stage_change_requests_customer_id_fkey FOREIGN KEY (customer_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.order_stage_change_requests
    ADD CONSTRAINT order_stage_change_requests_executor_id_fkey FOREIGN KEY (executor_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.order_stage_change_requests
    ADD CONSTRAINT order_stage_change_requests_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.order_stages
    ADD CONSTRAINT order_stages_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_order_stages_order
    ON public.order_stages(order_id);


ALTER TABLE IF EXISTS public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_orders_customer
    ON public.orders(customer_id);


ALTER TABLE IF EXISTS public.orders
    ADD CONSTRAINT orders_executor_id_fkey FOREIGN KEY (executor_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_executor
    ON public.orders(executor_id);


ALTER TABLE IF EXISTS public.orders
    ADD CONSTRAINT orders_fee_recipient_id_fkey FOREIGN KEY (fee_recipient_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE SET NULL;


ALTER TABLE IF EXISTS public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.project_collections
    ADD CONSTRAINT project_collections_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_project_collections_user_id
    ON public.project_collections(user_id);


ALTER TABLE IF EXISTS public.service_categories
    ADD CONSTRAINT service_categories_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES public.categories (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.service_categories
    ADD CONSTRAINT service_categories_service_id_fkey FOREIGN KEY (service_id)
    REFERENCES public.services (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.service_reviews
    ADD CONSTRAINT service_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_service_reviews_reviewer
    ON public.service_reviews(reviewer_id);


ALTER TABLE IF EXISTS public.service_reviews
    ADD CONSTRAINT service_reviews_service_id_fkey FOREIGN KEY (service_id)
    REFERENCES public.services (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_service_reviews_service
    ON public.service_reviews(service_id);


ALTER TABLE IF EXISTS public.services
    ADD CONSTRAINT services_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES public.categories (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_services_category_id
    ON public.services(category_id);


ALTER TABLE IF EXISTS public.services
    ADD CONSTRAINT services_provider_id_fkey FOREIGN KEY (provider_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE SET NULL;


ALTER TABLE IF EXISTS public.services
    ADD CONSTRAINT services_source_order_id_fkey FOREIGN KEY (source_order_id)
    REFERENCES public.orders (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS services_source_order_id_key
    ON public.services(source_order_id);


ALTER TABLE IF EXISTS public.services
    ADD CONSTRAINT services_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_services_user_id
    ON public.services(user_id);


ALTER TABLE IF EXISTS public.subscriptions
    ADD CONSTRAINT subscriptions_followed_id_fkey FOREIGN KEY (followed_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_subscriptions_followed_id
    ON public.subscriptions(followed_id);


ALTER TABLE IF EXISTS public.subscriptions
    ADD CONSTRAINT subscriptions_follower_id_fkey FOREIGN KEY (follower_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_subscriptions_follower_id
    ON public.subscriptions(follower_id);


ALTER TABLE IF EXISTS public.transactions
    ADD CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id)
    REFERENCES public.accounts (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_transactions_account_id
    ON public.transactions(account_id);


ALTER TABLE IF EXISTS public.user_activity_logs
    ADD CONSTRAINT user_activity_logs_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user
    ON public.user_activity_logs(user_id);


ALTER TABLE IF EXISTS public.user_balances
    ADD CONSTRAINT user_balances_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS user_balances_pkey
    ON public.user_balances(user_id);


ALTER TABLE IF EXISTS public.user_reviews
    ADD CONSTRAINT user_reviews_reviewed_user_id_fkey FOREIGN KEY (reviewed_user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_user_reviews_reviewed_user
    ON public.user_reviews(reviewed_user_id);


ALTER TABLE IF EXISTS public.user_reviews
    ADD CONSTRAINT user_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id)
    REFERENCES public.roles (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS idx_users_role_id
    ON public.users(role_id);


ALTER TABLE IF EXISTS public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_processed_by_fkey FOREIGN KEY (processed_by)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE SET NULL;


ALTER TABLE IF EXISTS public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.work_categories
    ADD CONSTRAINT work_categories_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES public.categories (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_work_categories_category
    ON public.work_categories(category_id);


ALTER TABLE IF EXISTS public.work_categories
    ADD CONSTRAINT work_categories_work_id_fkey FOREIGN KEY (work_id)
    REFERENCES public.works (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_work_categories_work
    ON public.work_categories(work_id);


ALTER TABLE IF EXISTS public.work_images
    ADD CONSTRAINT work_images_work_id_fkey FOREIGN KEY (work_id)
    REFERENCES public.works (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.work_likes
    ADD CONSTRAINT work_likes_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.work_likes
    ADD CONSTRAINT work_likes_work_id_fkey FOREIGN KEY (work_id)
    REFERENCES public.works (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.works
    ADD CONSTRAINT works_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_works_user_id
    ON public.works(user_id);
