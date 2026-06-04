FROM apache/spark-py:3.5.0

USER root

# Install wget to download the PostgreSQL JDBC driver jar
RUN apt-get update && apt-get install -y wget && \
    wget -q https://jdbc.postgresql.org/download/postgresql-42.7.2.jar -O /opt/spark/jars/postgresql-42.7.2.jar && \
    apt-get purge -y wget && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Copy the ETL python script
COPY etl.py /opt/spark/work-dir/etl.py

# Switch back to non-root spark user for security
USER 185

WORKDIR /opt/spark/work-dir

# Execute the ETL script using spark-submit on container start
CMD ["/opt/spark/bin/spark-submit", "etl.py"]
