ALTER TABLE "record_files" DROP CONSTRAINT "record_files_subject_known";
--> statement-breakpoint
ALTER TABLE "record_files" ADD CONSTRAINT "record_files_subject_known" CHECK ("record_files"."subject_type" in ('buyer', 'project', 'sale', 'expense', 'investment'));
