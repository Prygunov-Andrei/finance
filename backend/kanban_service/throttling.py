from rest_framework.throttling import SimpleRateThrottle


class KanbanAnonRateThrottle(SimpleRateThrottle):
    scope = 'anon'

    def get_cache_key(self, request, view):
        # Всегда по IP
        ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class KanbanUserRateThrottle(SimpleRateThrottle):
    scope = 'user'

    def get_cache_key(self, request, view):
        user = getattr(request, 'user', None)
        user_id = getattr(user, 'user_id', None) if user is not None else None
        if user_id is None:
            user_id = getattr(user, 'pk', None) if user is not None else None

        # Для service token вызовов user_id=None — ключимся по IP (как anon)
        ident = user_id if user_id is not None else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}

