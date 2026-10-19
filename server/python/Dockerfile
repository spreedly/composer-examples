# syntax=docker/dockerfile:1
#
# INTERIM BUILD. The Composer Python SDK (spreedly-composer-sdk-server) is not yet published
# to PyPI. We bring its source in through the BuildKit named context "sdk" (wired up
# in ../docker-compose.yml) and install it editable.
#
# Once the SDK is published, delete the SDK COPY below and replace the editable
# install in requirements.txt with a normal pinned dependency.

FROM python:3.14-slim
WORKDIR /app
# requirements.txt installs the SDK from "../../../composer-sdk-server-python".
# Inside the image /app/../../../ collapses to /, so place the SDK source at
# /composer-sdk-server-python for that relative path to resolve.
COPY --from=sdk . /composer-sdk-server-python
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./
RUN useradd --uid 10001 --create-home sidecar
USER sidecar
ENV PORT=3021
EXPOSE 3021
CMD ["python", "app.py"]
