from django.contrib import admin
from .models import (
    Worker, Supergroup, Shift, ShiftRegistration,
    Team, TeamMembership, Media, Report, Question, Answer,
    InviteToken,
)


@admin.register(Worker)
class WorkerAdmin(admin.ModelAdmin):
    list_display = ('name', 'role', 'phone', 'telegram_id', 'contractor', 'language', 'bot_started')
    list_filter = ('role', 'language', 'bot_started', 'contractor')
    search_fields = ('name', 'phone', 'telegram_id')


@admin.register(Supergroup)
class SupergroupAdmin(admin.ModelAdmin):
    list_display = ('object', 'contractor', 'telegram_group_id', 'created_at')
    list_filter = ('object', 'contractor')


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ('object', 'contractor', 'date', 'shift_type', 'start_time', 'end_time', 'status')
    list_filter = ('status', 'shift_type', 'object', 'contractor')
    search_fields = ('object__name',)
    date_hierarchy = 'date'


@admin.register(ShiftRegistration)
class ShiftRegistrationAdmin(admin.ModelAdmin):
    list_display = ('worker', 'shift', 'registered_at', 'geo_valid')
    list_filter = ('geo_valid', 'shift__date')
    search_fields = ('worker__name',)


class TeamMembershipInline(admin.TabularInline):
    model = TeamMembership
    extra = 0
    readonly_fields = ('joined_at',)


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ('topic_name', 'object', 'shift', 'brigadier', 'status', 'is_solo', 'created_at')
    list_filter = ('status', 'is_solo', 'object')
    search_fields = ('topic_name',)
    inlines = [TeamMembershipInline]


@admin.register(TeamMembership)
class TeamMembershipAdmin(admin.ModelAdmin):
    list_display = ('worker', 'team', 'joined_at', 'left_at')
    list_filter = ('team__shift__date',)
    search_fields = ('worker__name',)


@admin.register(Media)
class MediaAdmin(admin.ModelAdmin):
    list_display = ('media_type', 'author', 'team', 'tag', 'status', 'created_at')
    list_filter = ('media_type', 'tag', 'status')
    search_fields = ('author__name', 'text_content')
    date_hierarchy = 'created_at'


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ('report_number', 'report_type', 'trigger', 'team', 'shift', 'media_count', 'status', 'created_at')
    list_filter = ('report_type', 'trigger', 'status')
    date_hierarchy = 'created_at'


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('question_text_short', 'question_type', 'asked_by', 'team', 'status', 'created_at')
    list_filter = ('question_type', 'asked_by', 'status')

    def question_text_short(self, obj):
        return obj.question_text[:60]
    question_text_short.short_description = 'Текст вопроса'


@admin.register(Answer)
class AnswerAdmin(admin.ModelAdmin):
    list_display = ('answered_by', 'question', 'created_at')
    search_fields = ('answer_text',)


@admin.register(InviteToken)
class InviteTokenAdmin(admin.ModelAdmin):
    list_display = ('code', 'contractor', 'role', 'expires_at', 'used', 'used_by', 'created_at')
    list_filter = ('used', 'role', 'contractor')
    search_fields = ('code',)
    readonly_fields = ('code', 'bot_link', 'used_at')
