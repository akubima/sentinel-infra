import os
import sys
from pyspark.sql import SparkSession
from pyspark.sql.functions import avg, col, count, date_trunc, get_json_object, max, min, to_date

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
        .appName("SentinelDailyTelemetryAggregator") \
        .master("local[*]") \
        .config("spark.jars", "/opt/spark/jars/postgresql-42.7.2.jar") \
        .config("spark.sql.session.timeZone", "UTC") \
        .config("spark.sql.sources.partitionOverwriteMode", "dynamic") \
        .getOrCreate()

    print("Spark session initialized.")

    try:
        # 1. Read the previous complete UTC day from PostgreSQL via JDBC.
        jdbc_url = f"jdbc:postgresql://{db_host}:5432/{db_name}"
        query = """
        (
            SELECT time, id, metrics::text AS metrics
            FROM device_telemetry
            WHERE time >= (date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - INTERVAL '1 day'
              AND time <  (date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
        ) as telemetry_daily_batch
        """
        
        print(f"Reading previous complete UTC day from PostgreSQL database '{db_name}'...")
        df = spark.read \
            .format("jdbc") \
            .option("url", jdbc_url) \
            .option("dbtable", query) \
            .option("user", db_user) \
            .option("password", db_password) \
            .option("driver", "org.postgresql.Driver") \
            .load()

        raw_count = df.count()
        print(f"Fetched {raw_count} raw telemetry records from PostgreSQL.")

        if raw_count == 0:
            print("No telemetry data for the previous UTC day. Exiting.")
            return

        # 2. Aggregate per device per UTC day. Regulatory reporting must remain in UTC.
        daily_summary = df \
            .withColumn("day_utc", to_date(date_trunc("day", col("time")))) \
            .withColumn("tds", get_json_object(col("metrics"), "$.telemetry.tds").cast("double")) \
            .withColumn("temperature", get_json_object(col("metrics"), "$.telemetry.temperature").cast("double")) \
            .groupBy("day_utc", "id") \
            .agg(
                count("*").alias("sample_count"),
                avg("tds").alias("tds_avg"),
                min("tds").alias("tds_min"),
                max("tds").alias("tds_max"),
                avg("temperature").alias("temperature_avg"),
                min("temperature").alias("temperature_min"),
                max("temperature").alias("temperature_max"),
                min("time").alias("first_sample_at_utc"),
                max("time").alias("last_sample_at_utc")
            ) \
            .sortWithinPartitions("id")

        summary_count = daily_summary.count()
        print(f"Aggregated {summary_count} daily device summary rows.")

        # 3. Write daily summaries to HDFS in Parquet format, partitioned by UTC date.
        hdfs_path = os.getenv("DAILY_HDFS_PATH", "hdfs://hadoop-service:9000/user/sentinel/telemetry_daily")
        print(f"Writing daily UTC summaries to HDFS at: {hdfs_path}")
        
        daily_summary.write \
            .mode("overwrite") \
            .partitionBy("day_utc") \
            .parquet(hdfs_path)

        print("Daily UTC summary export completed successfully.")

    except Exception as e:
        print(f"ETL Job failed: {str(e)}")
        sys.exit(1)
    finally:
        spark.stop()
        print("Spark session stopped.")

if __name__ == "__main__":
    main()
