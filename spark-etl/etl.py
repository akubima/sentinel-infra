import os
import sys
from pyspark.sql import SparkSession
from pyspark.sql.functions import to_date

def main():
    # Retrieve Database credentials from environment variables
    db_host = os.getenv("PGHOST", "postgres-rw.sentinel-infra.svc.cluster.local")
    db_name = os.getenv("PGDATABASE", "sentinel")
    db_user = os.getenv("PGUSER")
    db_password = os.getenv("PGPASSWORD")
    
    if not db_user or not db_password:
        print("Error: PGUSER and PGPASSWORD environment variables must be set.")
        sys.exit(1)

    # Initialize Spark Session
    # Note: We configure it to run in local mode (single node) and use the PostgreSQL driver jar.
    spark = SparkSession.builder \
        .appName("SentinelTelemetryExporter") \
        .master("local[*]") \
        .config("spark.jars", "/opt/spark/jars/postgresql-42.7.2.jar") \
        .getOrCreate()

    print("Spark session initialized.")

    try:
        # 1. Read the last hour of telemetry data from PostgreSQL via JDBC
        jdbc_url = f"jdbc:postgresql://{db_host}:5432/{db_name}"
        query = "(SELECT * FROM device_telemetry WHERE time >= NOW() - INTERVAL '1 hour') as telemetry_batch"
        
        print(f"Reading batch data from PostgreSQL database '{db_name}'...")
        df = spark.read \
            .format("jdbc") \
            .option("url", jdbc_url) \
            .option("dbtable", query) \
            .option("user", db_user) \
            .option("password", db_password) \
            .option("driver", "org.postgresql.Driver") \
            .load()

        count = df.count()
        print(f"Fetched {count} records from PostgreSQL.")

        if count == 0:
            print("No new data to export. Exiting.")
            return

        # 2. Write the data to HDFS in Parquet format
        # Parquet is a compressed columnar format that is highly optimized for Hadoop queries.
        # We partition the data by date and sort within partitions by device ID for optimal storage and query performance.
        hdfs_path = "hdfs://hadoop-namenode-service:9000/user/sentinel/telemetry"
        print(f"Writing data to HDFS at: {hdfs_path}")
        
        df_partitioned = df \
            .withColumn("partition_date", to_date("time")) \
            .sortWithinPartitions("id")
        
        df_partitioned.write \
            .mode("append") \
            .partitionBy("partition_date") \
            .parquet(hdfs_path)

        print("Export completed successfully.")

    except Exception as e:
        print(f"ETL Job failed: {str(e)}")
        sys.exit(1)
    finally:
        spark.stop()
        print("Spark session stopped.")

if __name__ == "__main__":
    main()
