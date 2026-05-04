# Infrastructure — Frontend

Mostly server-side. Image serving and upload have client-facing components but those live in their consuming domains:
- Upload UIs in [upsell](../upsell/) (`components/upload/`)
- Image serving consumed throughout via the image utilities in [shared-ui](../shared-ui/)
