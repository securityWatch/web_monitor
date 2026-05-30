-- Chinese IM alert channels: DingTalk, Feishu/Lark, WeCom

DO $$ BEGIN ALTER TYPE alert_channel_type ADD VALUE 'dingtalk'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE alert_channel_type ADD VALUE 'feishu'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE alert_channel_type ADD VALUE 'wecom'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
