ALTER TABLE public.findit_games ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.findit_games DROP CONSTRAINT findit_games_status_check;
ALTER TABLE public.findit_games ADD CONSTRAINT findit_games_status_check CHECK(status IN ('WAITING','PLAYING','VOTING','CHALLENGE_RESULTS','OVERALL_VOTING','FINISHED','CLEANING'));
CREATE OR REPLACE FUNCTION public.findit_save_snapshot(p_game_code text,p_expected_version bigint,p_snapshot jsonb) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_version bigint;
BEGIN
 UPDATE public.findit_games SET snapshot=p_snapshot,version=version+1,last_activity_at=now()
 WHERE game_code=p_game_code AND version=p_expected_version AND status<>'CLEANING' AND last_activity_at>now()-interval '24 hours'
 RETURNING version INTO new_version;
 RETURN new_version;
END; $$;
REVOKE ALL ON FUNCTION public.findit_save_snapshot(text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.findit_save_snapshot(text,bigint,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.findit_claim_expired(p_game_code text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE claimed text;
BEGIN
 UPDATE public.findit_games SET status='CLEANING',version=version+1 WHERE game_code=p_game_code AND last_activity_at<=now()-interval '24 hours' RETURNING game_code INTO claimed;
 RETURN claimed IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.findit_claim_expired(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.findit_claim_expired(text) TO service_role;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
SELECT cron.schedule('findit-expired-game-cleanup','*/15 * * * *',$job$SELECT net.http_post(url:='https://tztpuqykknjxyqmtpjzp.supabase.co/functions/v1/findit-api',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"action":"cleanupExpiredGames"}'::jsonb,timeout_milliseconds:=120000);$job$);